"use client";

import Image from "next/image";
import { Check, Copy, GripVertical, ImagePlus, Package, Pencil, Plus, RefreshCw, Search, Tag, Trash2, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { withPpcBasePath } from "@/lib/glassco-apps";
import { getPipelineAuthorizationHeader } from "@/lib/pipeline-session";
import { MAX_DASHBOARD_PRODUCT_IMAGE_BYTES, type DashboardTag, type ManagedDashboardProduct } from "../domain/ppc-dashboard-catalog";
import styles from "./product-portfolio-panel.module.css";

function CopyIdentifierButton({ value, kind }: { value: string; kind: "ASIN" | "SKU" }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const resetTimer = useRef<number | null>(null);
  useEffect(() => () => { if (resetTimer.current != null) window.clearTimeout(resetTimer.current); }, []);
  const copyIdentifier = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 1_500);
  };
  const label = copyState === "copied" ? `Copied ${kind} ${value}` : copyState === "error" ? `Copy ${kind} ${value} failed` : `Copy ${kind} ${value}`;
  return <button type="button" className={styles.copyAsinButton} aria-label={label} title={copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : `Copy ${kind}`} onClick={copyIdentifier}>
    {copyState === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
  </button>;
}

export type ProductFormValue = {
  id: string;
  source: "pipeline" | "dashboard";
  name: string;
  asin: string;
  sku: string;
  tagId: string;
  imageDataUrl: string;
};

type Props = {
  products: ManagedDashboardProduct[];
  tags: DashboardTag[];
  loading: boolean;
  error: string;
  selectedProductId: string;
  onSelectProduct: (productId: string) => void;
  onRetry: () => void;
  onCreateTag: (name: string) => { id: string; error: string };
  onSaveProduct: (product: ProductFormValue) => string;
  onDeleteProduct: (product: ManagedDashboardProduct) => void;
  onReorderProducts?: (sourceId: string, targetId: string, visibleIds: string[]) => string;
};

const EMPTY_PRODUCT: ProductFormValue = { id: "", source: "dashboard", name: "", asin: "", sku: "", tagId: "", imageDataUrl: "" };

function productImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

function productMatchesFilters(product: ManagedDashboardProduct, filter: string, query: string, tagById: Map<string, DashboardTag>) {
  const matchesTag = filter === "all" || (filter === "untagged" ? !product.tagId : product.tagId === filter);
  const haystack = `${product.name} ${product.asin} ${product.sku} ${tagById.get(product.tagId)?.name ?? ""}`.toLocaleLowerCase();
  return matchesTag && (!query || haystack.includes(query));
}

export function ProductPortfolioPanel({ products, tags, loading, error, selectedProductId, onSelectProduct, onRetry, onCreateTag, onSaveProduct, onDeleteProduct, onReorderProducts }: Props) {
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [editMode, setEditMode] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [draggedId, setDraggedId] = useState("");
  const [dropTargetId, setDropTargetId] = useState("");
  const [reorderNotice, setReorderNotice] = useState("");
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<ManagedDashboardProduct | null>(null);
  const [form, setForm] = useState<ProductFormValue>(EMPTY_PRODUCT);
  const [formError, setFormError] = useState("");
  const [imageNotice, setImageNotice] = useState("");
  const manualImage = useRef(false);
  const [tagName, setTagName] = useState("");
  const [tagError, setTagError] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());

  useEffect(() => {
    if (!productDialogOpen || manualImage.current) return;
    const controller = new AbortController();
    const asin = form.asin.trim().toUpperCase();
    const timer = window.setTimeout(() => {
      if (manualImage.current) return;
      setForm(current => ({ ...current, imageDataUrl: "" }));
      setImageNotice("");
      if (!/^[A-Z0-9]{10}$/.test(asin)) return;
      setImageNotice("Looking up Amazon listing image…");
      void fetch(withPpcBasePath(`/api/dashboard/product-image?${new URLSearchParams({ asin })}`), {
        headers: getPipelineAuthorizationHeader(), cache: "no-store", signal: controller.signal,
      }).then(async response => {
        const value = await response.json();
        if (controller.signal.aborted || manualImage.current) return;
        if (!response.ok || value?.asin !== asin || typeof value.imageDataUrl !== "string" || value.imageDataUrl.length > 1_250_000 || !/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value.imageDataUrl)) {
          throw new Error("No listing image available. You can choose an image manually.");
        }
        setForm(current => current.asin.trim().toUpperCase() === asin ? { ...current, imageDataUrl: value.imageDataUrl } : current);
        setImageNotice("Amazon listing image added. You can replace it with your own.");
      }).catch(() => {
        if (!controller.signal.aborted && !manualImage.current) setImageNotice("No listing image available. You can choose an image manually.");
      });
    }, 500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [form.asin, productDialogOpen]);

  useEffect(() => {
    if (!productDialogOpen && !tagDialogOpen && !deleteCandidate && !actionsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setProductDialogOpen(false);
      setTagDialogOpen(false);
      setDeleteCandidate(null);
      setActionsOpen(false);
      setFormError("");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [actionsOpen, deleteCandidate, productDialogOpen, tagDialogOpen]);

  const tagById = useMemo(() => new Map(tags.map(tag => [tag.id, tag])), [tags]);
  const filteredProducts = useMemo(() => products.filter(product => {
    return productMatchesFilters(product, tagFilter, deferredSearch, tagById);
  }), [deferredSearch, products, tagById, tagFilter]);
  const changeTagFilter = (nextFilter: string) => {
    setTagFilter(nextFilter);
    const query = search.trim().toLocaleLowerCase();
    const firstProduct = products.find(product => productMatchesFilters(product, nextFilter, query, tagById));
    if (firstProduct) onSelectProduct(firstProduct.id);
  };
  const moveProduct = (sourceId: string, targetId: string) => {
    if (!editMode || !onReorderProducts || sourceId === targetId) return;
    const error = onReorderProducts(sourceId, targetId, filteredProducts.map(product => product.id));
    setReorderNotice(error || "Product order saved.");
  };

  const openCreateProduct = () => {
    manualImage.current = false;
    setImageNotice("");
    setForm({ ...EMPTY_PRODUCT, tagId: tagFilter !== "all" && tagFilter !== "untagged" ? tagFilter : "" });
    setFormError("");
    setProductDialogOpen(true);
  };
  const openEditProduct = (product: ManagedDashboardProduct) => {
    manualImage.current = Boolean(product.imageDataUrl);
    setImageNotice("");
    setForm({ id: product.id, source: product.source, name: product.name, asin: product.asin, sku: product.sku, tagId: product.tagId, imageDataUrl: product.imageDataUrl });
    setFormError("");
    setProductDialogOpen(true);
  };
  const closeProductDialog = () => {
    setProductDialogOpen(false);
    setFormError("");
  };
  const handleImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^image\/(?:png|jpe?g|webp|gif)$/i.test(file.type)) {
      setFormError("Choose a PNG, JPG, WEBP, or GIF image.");
      return;
    }
    if (file.size > MAX_DASHBOARD_PRODUCT_IMAGE_BYTES) {
      setFormError("Product images must be smaller than 900 KB.");
      return;
    }
    try {
      manualImage.current = true;
      setImageNotice("");
      const imageDataUrl = await productImage(file);
      setForm(current => ({ ...current, imageDataUrl }));
      setFormError("");
    } catch (imageError) {
      setFormError(imageError instanceof Error ? imageError.message : "Could not read that image.");
    }
  };
  const submitProduct = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setFormError("Product name is required.");
      return;
    }
    const saveError = onSaveProduct({ ...form, name, asin: form.asin.trim().toUpperCase(), sku: form.sku.trim() });
    if (saveError) {
      setFormError(saveError);
      return;
    }
    closeProductDialog();
  };
  const submitTag = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = tagName.trim();
    if (!name) return;
    const result = onCreateTag(name);
    if (result.error) {
      setTagError(result.error);
      return;
    }
    setTagFilter(result.id);
    setTagName("");
    setTagError("");
    setTagDialogOpen(false);
  };

  return <aside className={styles.panel} aria-labelledby="products-heading">
    <div className={styles.header}>
      <div className={styles.headingRow}><div className={styles.headingTitle}><h1 id="products-heading">Products</h1><span className={styles.count}>{products.length}</span></div><div className={styles.actionsMenu}><button type="button" className={styles.actionsTrigger} aria-label="Product actions" aria-expanded={actionsOpen} onClick={() => setActionsOpen(current => !current)}><Plus aria-hidden="true" /></button>{actionsOpen ? <div className={styles.actionsMenuPanel}><button type="button" onClick={() => { setActionsOpen(false); openCreateProduct(); }}><Plus aria-hidden="true" />Add product</button><button type="button" onClick={() => { setActionsOpen(false); setTagError(""); setTagDialogOpen(true); }}><Tag aria-hidden="true" />Add tag</button></div> : null}<button type="button" className={styles.actionsTrigger} aria-label={editMode ? "Exit product editing" : "Enable product editing"} title={editMode ? "Exit product editing" : "Enable product editing"} aria-pressed={editMode} onClick={() => { setActionsOpen(false); setEditMode(current => !current); }}><Pencil aria-hidden="true" /></button></div></div>
      <label className={styles.search}><Search aria-hidden="true" /><span className="sr-only">Search products</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search products..." /></label>
      <div className={styles.tagControls}>
        <label><span className="sr-only">Filter products by tag</span><Tag aria-hidden="true" /><select aria-label="Filter products by tag" value={tagFilter} onChange={event => changeTagFilter(event.target.value)}><option value="all">All tags</option><option value="untagged">Untagged</option>{tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>
      </div>
    </div>

    <span className="sr-only" role="status">{reorderNotice}</span>
    <div className={styles.list}>
      {loading ? <div className={styles.loadingState}><RefreshCw className={styles.spinner} aria-hidden="true" />Loading Pipeline products…</div> : null}
      {!loading && error ? <div className={styles.errorState} role="alert"><p>{error}</p><button type="button" onClick={onRetry}><RefreshCw aria-hidden="true" />Retry</button></div> : null}
      {!loading && !error && filteredProducts.length === 0 ? <div className={styles.emptyState}><Package aria-hidden="true" /><strong>No products found</strong><span>Try another tag or add a product.</span></div> : null}
      {filteredProducts.map(product => {
        const tag = tagById.get(product.tagId);
        const selected = selectedProductId === product.id;
        return <article key={product.id} className={`${styles.productCard} ${selected ? styles.selected : ""} ${tag ? styles.tagged : ""} ${editMode ? styles.editableCard : ""} ${draggedId === product.id ? styles.dragging : ""} ${dropTargetId === product.id ? styles.dropTarget : ""}`}
          onDragOver={event => { if (editMode && draggedId && draggedId !== product.id) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTargetId(product.id); } }}
          onDrop={event => { if (editMode && draggedId) { event.preventDefault(); moveProduct(draggedId, product.id); setDraggedId(""); setDropTargetId(""); } }}>
          <button type="button" className={styles.productSelect} aria-pressed={selected} onClick={() => onSelectProduct(product.id)}>
            <span className={styles.productImage}>{product.imageDataUrl ? <Image src={product.imageDataUrl} alt={`${product.name} product`} width={44} height={44} unoptimized /> : <Package aria-hidden="true" />}</span>
            <span className={styles.productCopy}>{tag ? <em><Tag aria-hidden="true" />{tag.name}</em> : null}<span className={styles.productTitle}><i aria-hidden="true" /><strong role="heading" aria-level={2}>{product.name}</strong></span></span>
          </button>
          <div className={styles.productIdentifiers}>
            <span>ASIN: {product.asin ? <><a href={`https://www.amazon.com/dp/${encodeURIComponent(product.asin)}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${selected ? "selected product" : product.name} ASIN ${product.asin} on Amazon`}>{product.asin}</a><CopyIdentifierButton key={product.asin} value={product.asin} kind="ASIN" /></> : "N/A"}</span>
            <span>SKU: {product.sku ? <><a href={`https://sellercentral.amazon.com/myinventory/inventory?searchField=sku&searchTerm=${encodeURIComponent(product.sku)}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${selected ? "selected product" : product.name} SKU ${product.sku} in Seller Central`}>{product.sku}</a><CopyIdentifierButton key={product.sku} value={product.sku} kind="SKU" /></> : "N/A"}</span>
          </div>
          {editMode ? <div className={styles.cardActions}><button type="button" aria-label={`Edit ${product.name}`} title="Edit product" onClick={() => openEditProduct(product)}><Pencil aria-hidden="true" /></button><button type="button" aria-label={`Delete ${product.name}`} title="Delete product" onClick={() => setDeleteCandidate(product)}><Trash2 aria-hidden="true" /></button>
            <button type="button" draggable className={styles.dragHandle} aria-label={`Reorder ${product.name}`} title="Drag to reorder, or use Up and Down arrow keys"
              onDragStart={event => { setDraggedId(product.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", product.id); }}
              onDragEnd={() => { setDraggedId(""); setDropTargetId(""); }}
              onKeyDown={event => {
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                event.preventDefault();
                const index = filteredProducts.findIndex(candidate => candidate.id === product.id);
                const target = filteredProducts[index + (event.key === "ArrowUp" ? -1 : 1)];
                if (target) moveProduct(product.id, target.id);
              }}><GripVertical aria-hidden="true" /></button>
          </div> : null}
        </article>;
      })}
    </div>

    {productDialogOpen ? <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) closeProductDialog(); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="product-dialog-title">
        <header><div><span className={styles.eyebrow}>PPC WEEKLY GOALS</span><h2 id="product-dialog-title">{form.id ? "Edit product" : "Add product"}</h2></div><button type="button" aria-label="Close product form" onClick={closeProductDialog}><X aria-hidden="true" /></button></header>
        <form onSubmit={submitProduct}>
          <label className={styles.imageField}><span>Product image</span><span className={styles.imagePicker}>{form.imageDataUrl ? <Image src={form.imageDataUrl} alt="Product preview" width={64} height={64} unoptimized /> : <ImagePlus aria-hidden="true" />}<span><strong>{form.imageDataUrl ? "Change image" : "Choose image"}</strong><small>PNG, JPG, WEBP, or GIF · max 900 KB</small></span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => void handleImage(event)} /></span></label>
          <small role="status">{imageNotice || "Enter an ASIN to find its Amazon listing image automatically, or choose your own image."}</small>
          <label>Product name<input autoFocus maxLength={120} required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Enter product name" /></label>
          <div className={styles.formColumns}><label>ASIN<input maxLength={30} value={form.asin} onChange={event => {
            const asin = event.target.value;
            setForm(current => ({ ...current, asin, imageDataUrl: manualImage.current ? current.imageDataUrl : "" }));
            if (!manualImage.current) setImageNotice(/^[A-Z0-9]{10}$/i.test(asin.trim()) ? "Looking up Amazon listing image…" : "");
          }} placeholder="B0XXXXXXXX" /></label><label>SKU<input maxLength={80} value={form.sku} onChange={event => setForm(current => ({ ...current, sku: event.target.value }))} placeholder="Your SKU" /></label></div>
          <label>Tag<select value={form.tagId} onChange={event => setForm(current => ({ ...current, tagId: event.target.value }))}><option value="">No tag</option>{tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>
          {form.imageDataUrl ? <button type="button" className={styles.removeImage} onClick={() => { manualImage.current = true; setImageNotice(""); setForm(current => ({ ...current, imageDataUrl: "" })); }}>Remove image</button> : null}
          {formError ? <p className={styles.formError} role="alert">{formError}</p> : null}
          <footer><button type="button" onClick={closeProductDialog}>Cancel</button><button type="submit" disabled={imageNotice === "Looking up Amazon listing image…"} className={styles.primary}>{form.id ? "Save changes" : "Add product"}</button></footer>
        </form>
      </section>
    </div> : null}

    {tagDialogOpen ? <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) setTagDialogOpen(false); }}>
      <section className={`${styles.dialog} ${styles.smallDialog}`} role="dialog" aria-modal="true" aria-labelledby="tag-dialog-title"><header><div><span className={styles.eyebrow}>ORGANIZE PRODUCTS</span><h2 id="tag-dialog-title">Add tag</h2></div><button type="button" aria-label="Close tag form" onClick={() => setTagDialogOpen(false)}><X aria-hidden="true" /></button></header><form onSubmit={submitTag}><label>Tag name<input autoFocus maxLength={40} required value={tagName} onChange={event => setTagName(event.target.value)} placeholder="Example: Launching" /></label>{tagError ? <p className={styles.formError} role="alert">{tagError}</p> : null}<footer><button type="button" onClick={() => setTagDialogOpen(false)}>Cancel</button><button type="submit" className={styles.primary}>Add tag</button></footer></form></section>
    </div> : null}

    {deleteCandidate ? <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) setDeleteCandidate(null); }}>
      <section className={`${styles.dialog} ${styles.smallDialog}`} role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title"><header><div><span className={styles.dangerEyebrow}>DELETE PRODUCT</span><h2 id="delete-dialog-title">Remove {deleteCandidate.name}?</h2></div><button type="button" aria-label="Close delete confirmation" onClick={() => setDeleteCandidate(null)}><X aria-hidden="true" /></button></header><p className={styles.dialogCopy}>{deleteCandidate.source === "pipeline" ? "This removes the product only from PPC Weekly Goals. It remains unchanged in Product Pipeline, and its existing weekly reports are retained." : "This removes the dashboard-added product from this panel. Existing weekly report records are retained."}</p><footer><button type="button" onClick={() => setDeleteCandidate(null)}>Cancel</button><button type="button" className={styles.deleteButton} onClick={() => { onDeleteProduct(deleteCandidate); setDeleteCandidate(null); }}>Delete product</button></footer></section>
    </div> : null}
  </aside>;
}
