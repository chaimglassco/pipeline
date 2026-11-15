import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProductPortfolioPanel } from "./product-portfolio-panel";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function openProductActions() {
  fireEvent.click(screen.getByRole("button", { name: "Product actions" }));
}

it("exposes reorder handles only in edit mode and supports dropping and keyboard movement", () => {
  const reorder = vi.fn(() => "");
  const products = ["First", "Second"].map(name => ({ id: name, name, asin: "", sku: "", stageId: "dashboard", status: "Active" as const, source: "dashboard" as const, tagId: "", imageDataUrl: "" }));
  render(<ProductPortfolioPanel products={products} tags={[]} loading={false} error="" selectedProductId="First" onSelectProduct={vi.fn()} onRetry={vi.fn()} onCreateTag={() => ({ id: "", error: "" })} onSaveProduct={() => ""} onDeleteProduct={vi.fn()} onReorderProducts={reorder} />);
  expect(screen.queryByRole("button", { name: "Reorder First" })).not.toBeInTheDocument();
  openProductActions();
  fireEvent.click(screen.getByRole("button", { name: "Enable product editing" }));
  const handle = screen.getByRole("button", { name: "Reorder First" });
  const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(handle, { dataTransfer });
  const target = screen.getByRole("button", { name: "Reorder Second" }).closest("article")!;
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
  expect(reorder).toHaveBeenCalledWith("First", "Second", ["First", "Second"]);
  fireEvent.keyDown(handle, { key: "ArrowDown" });
  expect(reorder).toHaveBeenCalledTimes(2);
  openProductActions();
  fireEvent.click(screen.getByRole("button", { name: "Exit product editing" }));
  expect(screen.queryByRole("button", { name: "Reorder First" })).not.toBeInTheDocument();
});

it("selects the first visible product whenever the tag filter changes", () => {
  const selectProduct = vi.fn();
  const tags = [{ id: "lead", name: "Lead Came" }, { id: "comp", name: "Complementary" }];
  const products = [
    { id: "lead-1", name: "Lead Nippers", asin: "B000000001", sku: "L1", stageId: "dashboard", status: "Active" as const, source: "dashboard" as const, tagId: "lead", imageDataUrl: "" },
    { id: "comp-1", name: "Plastic Fids", asin: "B000000002", sku: "C1", stageId: "dashboard", status: "Active" as const, source: "dashboard" as const, tagId: "comp", imageDataUrl: "" },
    { id: "comp-2", name: "Glazing Nails", asin: "B000000003", sku: "C2", stageId: "dashboard", status: "Active" as const, source: "dashboard" as const, tagId: "comp", imageDataUrl: "" },
  ];
  render(<ProductPortfolioPanel products={products} tags={tags} loading={false} error="" selectedProductId="lead-1" onSelectProduct={selectProduct} onRetry={vi.fn()} onCreateTag={() => ({ id: "", error: "" })} onSaveProduct={() => ""} onDeleteProduct={vi.fn()} />);

  fireEvent.change(screen.getByRole("combobox", { name: "Filter products by tag" }), { target: { value: "comp" } });
  expect(selectProduct).toHaveBeenLastCalledWith("comp-1");
  fireEvent.change(screen.getByRole("combobox", { name: "Filter products by tag" }), { target: { value: "all" } });
  expect(selectProduct).toHaveBeenLastCalledWith("lead-1");
});
const image = "data:image/jpeg;base64,/9j/";
function openForm() {
  const save = vi.fn(() => "");
  render(<ProductPortfolioPanel products={[]} tags={[]} loading={false} error="" selectedProductId="" onSelectProduct={vi.fn()} onRetry={vi.fn()} onCreateTag={() => ({ id: "", error: "" })} onSaveProduct={save} onDeleteProduct={vi.fn()} />);
  openProductActions();
  fireEvent.click(screen.getByRole("button", { name: "Add product" }));
  return { dialog: screen.getByRole("dialog"), save };
}

it("loads the ASIN image and includes it when the product is saved", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ asin: "B0FG4H5C6W", imageDataUrl: image }) })));
  const { dialog, save } = openForm();
  fireEvent.change(within(dialog).getByLabelText("Product name"), { target: { value: "Lead came" } });
  fireEvent.change(within(dialog).getByLabelText("ASIN"), { target: { value: "b0fg4h5c6w" } });
  expect(await screen.findByAltText("Product preview", {}, { timeout: 2000 })).toHaveAttribute("src", image);
  fireEvent.click(within(dialog).getByRole("button", { name: "Add product" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ asin: "B0FG4H5C6W", imageDataUrl: image }));
});

it("does not overwrite a manual upload with a late lookup", async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise(value => { resolve = value; })));
  const { dialog } = openForm();
  fireEvent.change(within(dialog).getByLabelText("ASIN"), { target: { value: "B0FG4H5C6W" } });
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  fireEvent.change(within(dialog).getByLabelText(/Product image/), { target: { files: [new File(["manual"], "manual.png", { type: "image/png" })] } });
  const preview = await screen.findByAltText("Product preview");
  const manual = preview.getAttribute("src");
  resolve({ ok: true, json: async () => ({ asin: "B0FG4H5C6W", imageDataUrl: image }) });
  await waitFor(() => expect(preview).toHaveAttribute("src", manual));
});

it("exports the visible products' Amazon details to an Excel download and reports failures", async () => {
  const tags = [{ id: "lead", name: "Lead Came" }];
  const products = [
    { id: "lead-1", name: "Round U", asin: "B0DYSBW3X5", sku: "L1", stageId: "dashboard", status: "Active" as const, source: "dashboard" as const, tagId: "lead", imageDataUrl: "" },
    { id: "other-1", name: "Fids", asin: "B000000002", sku: "C1", stageId: "dashboard", status: "Active" as const, source: "dashboard" as const, tagId: "", imageDataUrl: "" },
  ];
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(new Blob(["xlsx"]), { headers: { "Content-Disposition": 'attachment; filename="amazon-product-details-2026-11-15.xlsx"' } }))
    .mockResolvedValueOnce(Response.json({ error: "Connect Scale Insights from the dashboard first, then export again." }, { status: 502 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:export"), revokeObjectURL: vi.fn() }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  render(<ProductPortfolioPanel products={products} tags={tags} loading={false} error="" selectedProductId="lead-1" onSelectProduct={vi.fn()} onRetry={vi.fn()} onCreateTag={() => ({ id: "", error: "" })} onSaveProduct={() => ""} onDeleteProduct={vi.fn()} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Filter products by tag" }), { target: { value: "lead" } });

  fireEvent.click(await screen.findByRole("button", { name: "Export Amazon details for 1 product to Excel" }));
  expect(await screen.findByText("Downloaded amazon-product-details-2026-11-15.xlsx.")).toBeInTheDocument();
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/ppc/api/dashboard/product-export");
  expect(JSON.parse(init.body)).toEqual({ products: [{ asin: "B0DYSBW3X5", sku: "L1", name: "Round U" }] });
  expect(click).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "Export Amazon details for 1 product to Excel" }));
  expect(await screen.findByText("Connect Scale Insights from the dashboard first, then export again.")).toBeInTheDocument();
  expect(click).toHaveBeenCalledTimes(1);
  click.mockRestore();
});
