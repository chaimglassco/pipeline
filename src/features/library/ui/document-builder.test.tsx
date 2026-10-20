import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getPublishedDocuments } from "../data/repository";
import { createBlankContentElement, getInitialContentElements } from "../domain/document-elements";
import { DocumentBuilder } from "./document-builder";

function installSharedImageFetch(url: string) {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:shared-image") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  window.localStorage.setItem("launchflow.authSession.v1", JSON.stringify({ token: "test-token", email: "admin@example.com", name: "Admin", role: "ADMIN" }));
  const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(init?.method === "POST"
    ? new Response(JSON.stringify({ url }), { status: 200, headers: { "Content-Type": "application/json" } })
    : new Response(new Blob(["image"], { type: "image/png" }), { status: 200, headers: { "Content-Type": "image/png" } })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function pastePlainText(target: HTMLElement, value: string) {
  fireEvent.paste(target, { clipboardData: { types: ["text/plain"], getData: (type: string) => type === "text/plain" ? value : "" } });
}

describe("DocumentBuilder metadata editing", () => {
  it("edits and saves the title, description, and category inside document edit mode", async () => {
    const document = getPublishedDocuments()[0];
    const onSave = vi.fn().mockResolvedValue(undefined);
    const categories = [document.category, "Online Arbitrage"];
    const view = render(<DocumentBuilder canEdit doc={document} categories={categories} activeTopicId={document.topics[0]?.id ?? ""} onTopicChange={vi.fn()} onSave={onSave} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);

    expect(controls.queryByRole("textbox", { name: "Document title" })).not.toBeInTheDocument();
    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    fireEvent.change(controls.getByRole("textbox", { name: "Document title" }), { target: { value: "Updated document title" } });
    fireEvent.change(controls.getByRole("textbox", { name: "Document description" }), { target: { value: "Updated document description" } });
    fireEvent.change(controls.getByRole("combobox", { name: "Document category" }), { target: { value: "Online Arbitrage" } });
    fireEvent.click(controls.getAllByRole("button", { name: "Save changes" })[0]);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][1]).toEqual({ title: "Updated document title", description: "Updated document description", category: "Online Arbitrage" });
  }, 10_000);
});

describe("DocumentBuilder element reordering", () => {
  it("supports dragging elements into a new saved position", async () => {
    const document = getPublishedDocuments()[0];
    const initialElements = getInitialContentElements(document);
    const onSave = vi.fn().mockResolvedValue(undefined);

    const view = render(<DocumentBuilder canEdit doc={document} activeTopicId={document.topics[0]?.id ?? ""} onTopicChange={vi.fn()} onSave={onSave} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);
    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    fireEvent.click(controls.getByRole("button", { name: "REORDER" }));

    const dialog = controls.getByRole("dialog", { name: "Reorder elements" });
    const rows = within(dialog).getAllByRole("listitem");
    const dataTransfer = { effectAllowed: "", dropEffect: "", setData: vi.fn(), getData: () => initialElements[0].id };
    fireEvent.dragStart(rows[0], { dataTransfer });
    fireEvent.dragEnter(rows[1], { dataTransfer });
    fireEvent.dragOver(rows[1], { dataTransfer });
    fireEvent.drop(rows[1], { dataTransfer });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save order" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].slice(0, 2).map((element: { id: string }) => element.id)).toEqual([initialElements[1].id, initialElements[0].id]);
  });

  it("reorders elements in the dialog and saves the new order", async () => {
    const document = getPublishedDocuments()[0];
    const initialElements = getInitialContentElements(document);
    const onSave = vi.fn().mockResolvedValue(undefined);

    const view = render(<DocumentBuilder canEdit doc={document} activeTopicId={document.topics[0]?.id ?? ""} onTopicChange={vi.fn()} onSave={onSave} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);

    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    fireEvent.click(controls.getByRole("button", { name: "REORDER" }));

    const dialog = controls.getByRole("dialog", { name: "Reorder elements" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(initialElements.length);

    fireEvent.click(within(dialog).getByRole("button", { name: `Move ${initialElements[0].title} down` }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save order" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const savedElements = onSave.mock.calls[0][0];
    expect(savedElements.slice(0, 2).map((element: { id: string }) => element.id)).toEqual([initialElements[1].id, initialElements[0].id]);
    expect(savedElements.filter((element: { type: string }) => element.type === "topic").map((element: { eyebrow: string }) => element.eyebrow)).toEqual(initialElements.filter(element => element.type === "topic").map((_, index) => `Part ${index + 1}`));
    expect(controls.queryByRole("dialog", { name: "Reorder elements" })).not.toBeInTheDocument();
  });
});

describe("DocumentBuilder element insertion", () => {
  it("adds a selected element directly after the chosen element", async () => {
    const document = getPublishedDocuments()[0];
    const initialElements = getInitialContentElements(document);
    const onSave = vi.fn().mockResolvedValue(undefined);

    const view = render(<DocumentBuilder canEdit doc={document} activeTopicId={document.topics[0]?.id ?? ""} onTopicChange={vi.fn()} onSave={onSave} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);
    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);

    expect(view.container.querySelectorAll('button[aria-label^="Add element after "]')).toHaveLength(initialElements.length);
    fireEvent.click(controls.getByRole("button", { name: `Add element after ${initialElements[0].title}` }));
    fireEvent.click(controls.getByRole("button", { name: "Centered Statement" }));
    fireEvent.click(controls.getAllByRole("button", { name: "Save changes" })[0]);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const savedElements = onSave.mock.calls[0][0];
    expect(savedElements[0].id).toBe(initialElements[0].id);
    expect(savedElements[1].type).toBe("statement");
    expect(savedElements[2].id).toBe(initialElements[1].id);
  });

  it("offers one Bullets element with Bullets, Checklist, and Numbers tabs", async () => {
    const baseDocument = getPublishedDocuments()[0];
    const bullets = { ...createBlankContentElement("bullets", 1), items: ["Keep this item"] };
    const onSave = vi.fn().mockResolvedValue(undefined);
    const view = render(<DocumentBuilder canEdit doc={{ ...baseDocument, contentElements: [bullets] }} activeTopicId="" onTopicChange={vi.fn()} onSave={onSave} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);

    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    fireEvent.click(controls.getByRole("button", { name: "Add element after Keep this item" }));
    expect(controls.getAllByRole("button", { name: "Bullets" })).toHaveLength(2);
    expect(controls.queryByRole("button", { name: "Bullet Text" })).not.toBeInTheDocument();
    expect(controls.queryByRole("button", { name: "Checklist Bullets" })).not.toBeInTheDocument();
    expect(controls.queryByRole("button", { name: "Numbered Text" })).not.toBeInTheDocument();

    const styleTabs = controls.getByRole("group", { name: "Bullets style" });
    expect(within(styleTabs).getByRole("button", { name: "Bullets" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(styleTabs).getByRole("button", { name: "Checklist" }));
    expect(within(styleTabs).getByRole("button", { name: "Checklist" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(styleTabs).getByRole("button", { name: "Numbers" }));
    expect(within(styleTabs).getByRole("button", { name: "Numbers" })).toHaveAttribute("aria-pressed", "true");
    expect(controls.getByText("1.")).toBeInTheDocument();

    fireEvent.click(controls.getAllByRole("button", { name: "Save changes" })[0]);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0][0]).toMatchObject({ type: "numbered", items: ["Keep this item"] });
  });
});

describe("DocumentBuilder diagnostic flows", () => {
  it("adds and saves a multiline rich-text description separately from connector text", async () => {
    const baseDocument = getPublishedDocuments()[0];
    const flow = { ...createBlankContentElement("flowchart", 1), nodes: [{ title: "Check performance", text: "If inefficient" }] };
    const onSave = vi.fn().mockResolvedValue(undefined);
    const view = render(<DocumentBuilder canEdit doc={{ ...baseDocument, contentElements: [flow] }} activeTopicId="" onTopicChange={vi.fn()} onSave={onSave} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);

    expect(controls.queryByText("Flow description line one")).not.toBeInTheDocument();
    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    const description = controls.getByRole("textbox", { name: "Flow step 1 description" });
    pastePlainText(description, "Flow description line one\nFlow description line two");
    await waitFor(() => expect(description).toHaveTextContent("Flow description line one"));
    expect(controls.getByDisplayValue("If inefficient")).toHaveAttribute("placeholder", "Connector text");
    fireEvent.click(controls.getAllByRole("button", { name: "Save changes" })[0]);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0][0].nodes[0]).toMatchObject({ title: "Check performance", text: "If inefficient", description: expect.stringContaining("Flow description line one"), descriptionRichText: { type: "doc" } });
    expect(controls.getByText("Flow description line one")).toBeInTheDocument();
    expect(controls.getByText("If inefficient")).toBeInTheDocument();
  });
});

describe("DocumentBuilder aligned text elements", () => {
  it("offers separate Headline and Description elements and persists their formatting alignment", async () => {
    const baseDocument = getPublishedDocuments()[0];
    const headline = createBlankContentElement("headline", 1);
    const description = createBlankContentElement("description", 1);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const view = render(<DocumentBuilder canEdit doc={{ ...baseDocument, contentElements: [headline, description] }} activeTopicId="" onTopicChange={vi.fn()} onSave={onSave} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);

    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    expect(controls.queryByRole("button", { name: "Add document element" })).not.toBeInTheDocument();
    const inlineAddButtons = controls.getAllByRole("button", { name: /Add element after/ });
    fireEvent.click(inlineAddButtons[0]);
    expect(controls.getByRole("button", { name: "Headline" })).toBeVisible();
    expect(controls.getByRole("button", { name: "Description" })).toBeVisible();
    fireEvent.click(inlineAddButtons[0]);

    const headlineTextbox = controls.getByRole("textbox", { name: "Headline" });
    const descriptionTextbox = controls.getByRole("textbox", { name: "Description" });
    const headlineEditor = headlineTextbox.closest<HTMLElement>('[data-text-alignment="left"]');
    const descriptionEditor = descriptionTextbox.closest<HTMLElement>('[data-text-alignment="left"]');
    expect(headlineEditor).not.toBeNull();
    expect(descriptionEditor).not.toBeNull();
    expect(within(controls.getByRole("toolbar", { name: "Headline formatting" })).queryByRole("button", { name: "Bullets" })).not.toBeInTheDocument();
    expect(within(controls.getByRole("toolbar", { name: "Description formatting" })).getByRole("button", { name: "Bullets" })).toBeInTheDocument();
    pastePlainText(headlineTextbox, "Aligned headline");
    pastePlainText(descriptionTextbox, "Aligned description");
    fireEvent.click(within(headlineEditor as HTMLElement).getByRole("button", { name: "Align center" }));
    fireEvent.click(within(descriptionEditor as HTMLElement).getByRole("button", { name: "Align right" }));
    fireEvent.click(controls.getAllByRole("button", { name: "Save changes" })[0]);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0][0]).toMatchObject({ type: "headline", text: "Aligned headline", textAlignment: "center", richText: { type: "doc" } });
    expect(onSave.mock.calls[0][0][1]).toMatchObject({ type: "description", text: "Aligned description", textAlignment: "right", richText: { type: "doc" } });
    expect(controls.getByText("Aligned headline").closest("section")).toHaveAttribute("data-text-alignment", "center");
    expect(controls.getByText("Aligned description").closest("section")).toHaveAttribute("data-text-alignment", "right");
  });
});

describe("DocumentBuilder mode controls", () => {
  it("shows Eye in view mode, Pencil plus an explicit save action in edit mode, and preserves the active topic", async () => {
    const document = getPublishedDocuments()[0];
    const activeTopicId = document.topics.find(topic => topic.level === 2)?.id ?? "";
    const onModeTransition = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const view = render(<DocumentBuilder canEdit doc={document} activeTopicId={activeTopicId} onTopicChange={vi.fn()} onModeTransition={onModeTransition} onSave={onSave} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);
    const enterEdit = controls.getAllByRole("button", { name: "Switch to edit mode" })[0];

    expect(enterEdit.querySelector(".lucide-eye")).not.toBeNull();
    expect(controls.queryByRole("button", { name: "Add document element" })).not.toBeInTheDocument();
    fireEvent.click(enterEdit);

    expect(onModeTransition).toHaveBeenLastCalledWith(activeTopicId);
    const editModeIndicator = controls.getAllByRole("button", { name: "Edit mode active" })[0];
    expect(editModeIndicator.querySelector(".lucide-pencil")).not.toBeNull();
    expect(editModeIndicator).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
    expect(controls.getAllByRole("button", { name: "Save changes" }).length).toBeGreaterThan(0);
    expect(controls.getAllByRole("button", { name: /Add element after/ }).length).toBeGreaterThan(0);

    fireEvent.click(controls.getAllByRole("button", { name: "Save changes" })[0]);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onModeTransition).toHaveBeenLastCalledWith(activeTopicId);
    expect(controls.getAllByRole("button", { name: "Switch to edit mode" })[0].querySelector(".lucide-eye")).not.toBeNull();
  });

  it("keeps the editor and unsaved formatting open when save verification fails", async () => {
    const document = getPublishedDocuments()[0];
    const onSave = vi.fn().mockRejectedValue(new Error("The document save could not be verified. Your changes remain open."));
    const view = render(<DocumentBuilder canEdit doc={document} activeTopicId="" onTopicChange={vi.fn()} onSave={onSave} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);

    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    expect(controls.getAllByRole("button", { name: "Save changes" }).length).toBeGreaterThan(0);

    fireEvent.click(controls.getAllByRole("button", { name: "Save changes" })[0]);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(controls.getAllByText("The document save could not be verified. Your changes remain open.").length).toBeGreaterThan(0);
    expect(controls.getAllByRole("button", { name: "Save changes" }).length).toBeGreaterThan(0);
  });
});

describe("DocumentBuilder editable tables", () => {
  it("deletes the selected row and column, keeps widths synchronized, and preserves one of each", async () => {
    const baseDocument = getPublishedDocuments()[0];
    const table = { ...createBlankContentElement("table", 1), columns: ["First", "Second"], rows: [["A1", "A2"], ["B1", "B2"]], columnWidths: [180, 260] };
    const onSave = vi.fn().mockResolvedValue(undefined);
    const view = render(<DocumentBuilder canEdit doc={{ ...baseDocument, contentElements: [table] }} activeTopicId="" onTopicChange={vi.fn()} onSave={onSave} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);

    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    fireEvent.click(controls.getByRole("button", { name: "Delete column 2" }));
    expect(controls.queryByDisplayValue("Second")).not.toBeInTheDocument();
    expect(controls.queryByDisplayValue("A2")).not.toBeInTheDocument();
    fireEvent.click(controls.getByRole("button", { name: "Delete row 2" }));
    expect(controls.queryByDisplayValue("B1")).not.toBeInTheDocument();
    expect(controls.getByRole("button", { name: "Delete column 1" })).toBeDisabled();
    expect(controls.getByRole("button", { name: "Delete row 1" })).toBeDisabled();
    fireEvent.click(controls.getAllByRole("button", { name: "Save changes" })[0]);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0][0]).toMatchObject({ columns: ["First"], rows: [["A1"]], columnWidths: [180] });
  });
});

describe("DocumentBuilder dropdown elements", () => {
  it("renders every dropdown collapsed by default", () => {
    const baseDocument = getPublishedDocuments()[0];
    const accordion = {
      ...createBlankContentElement("accordion", 1),
      dropdowns: [
        { title: "First dropdown", text: "First dropdown content" },
        { title: "Second dropdown", text: "Second dropdown content" },
      ],
    };
    const document = { ...baseDocument, contentElements: [accordion] };

    const view = render(<DocumentBuilder canEdit doc={document} activeTopicId="" onTopicChange={vi.fn()} onSave={vi.fn()} onSaveVideoUrl={vi.fn()} />);
    const dropdowns = view.container.querySelectorAll("article details");

    expect(dropdowns).toHaveLength(2);
    dropdowns.forEach(dropdown => expect(dropdown).not.toHaveAttribute("open"));
  });
});

describe("DocumentBuilder feature cards", () => {
  it("renders each saved line on its own row", () => {
    const baseDocument = getPublishedDocuments()[0];
    const feature = {
      ...createBlankContentElement("feature", 1),
      label: "Feature label",
      title: "Feature title",
      text: "First row\nSecond row\nThird row",
    };
    const document = { ...baseDocument, contentElements: [feature] };

    const view = render(<DocumentBuilder canEdit doc={document} activeTopicId="" onTopicChange={vi.fn()} onSave={vi.fn()} onSaveVideoUrl={vi.fn()} />);
    const firstRow = view.getByText("First row");
    const rows = firstRow.parentElement?.querySelectorAll("p");

    expect(firstRow.tagName).toBe("P");
    expect(rows).toHaveLength(3);
    expect(Array.from(rows ?? []).map(row => row.textContent)).toEqual(["First row", "Second row", "Third row"]);
  });
});

describe("DocumentBuilder key insights", () => {
  it("defaults legacy insights to green and saves Green, Blue, or Red color choices", async () => {
    const baseDocument = getPublishedDocuments()[0];
    const insight = { ...createBlankContentElement("insight", 1), title: "Pro Tip", text: "Use the account data." };
    delete insight.insightColor;
    const onSave = vi.fn().mockResolvedValue(undefined);
    const view = render(<DocumentBuilder canEdit doc={{ ...baseDocument, contentElements: [insight] }} activeTopicId="" onTopicChange={vi.fn()} onSave={onSave} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);

    expect(view.container.querySelector('[data-insight-color="green"]')).toBeInTheDocument();
    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    const colors = controls.getByRole("group", { name: "Insight color" });
    expect(within(colors).getByRole("button", { name: "Green" })).toHaveAttribute("aria-pressed", "true");
    expect(within(colors).getByRole("button", { name: "Blue" })).toHaveAttribute("aria-pressed", "false");
    expect(within(colors).getByRole("button", { name: "Red" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(within(colors).getByRole("button", { name: "Red" }));
    expect(view.container.querySelector('[data-insight-color="red"]')).toBeInTheDocument();
    fireEvent.click(controls.getAllByRole("button", { name: "Save changes" })[0]);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0][0].insightColor).toBe("red");
    expect(view.container.querySelector('[data-insight-color="red"]')).toBeInTheDocument();
  });
});

describe("DocumentBuilder roadmaps", () => {
  it("uploads step images, saves formatted subtext and alignment, then renders them in view mode", async () => {
    installSharedImageFetch("/ppc/api/library/images?pathname=glassco%2Flibrary-images%2Fshared.png");
    const baseDocument = getPublishedDocuments()[0];
    const roadmap = {
      ...createBlankContentElement("timeline", 1),
      title: "Launch roadmap",
      steps: [{ title: "Step one", text: "Complete the first step", imageUrl: "" }],
    };
    const document = { ...baseDocument, contentElements: [roadmap] };
    const onSave = vi.fn().mockResolvedValue(undefined);

    const view = render(<DocumentBuilder canEdit doc={document} activeTopicId="" onTopicChange={vi.fn()} onSave={onSave} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);
    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    fireEvent.change(controls.getByLabelText("Upload step 1 image"), { target: { files: [new File(["roadmap image"], "roadmap.png", { type: "image/png" })] } });
    fireEvent.click(controls.getByRole("button", { name: "Bullets" }));
    fireEvent.click(controls.getByRole("button", { name: "Right" }));
    fireEvent.click(controls.getByRole("button", { name: "Center number" }));
    expect(controls.getByRole("textbox", { name: "Step 1 subtext" }).querySelector("ul")).toBeInTheDocument();
    await waitFor(() => expect(controls.getByRole("button", { name: "Preview step 1 image" })).toBeInTheDocument());
    fireEvent.click(controls.getAllByRole("button", { name: "Save changes" })[0]);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const savedRoadmap = onSave.mock.calls[0][0][0];
    expect(savedRoadmap.alignment).toBe("right");
    expect(savedRoadmap.numberPosition).toBe("center");
    expect(savedRoadmap.steps[0].imageUrl).toContain("/ppc/api/library/images?pathname=");
    expect(savedRoadmap.steps[0].textStyle).toBe("bullets");
    expect(view.container.querySelector('section[data-alignment="right"]')).toBeInTheDocument();
    expect(view.container.querySelector('section[data-number-position="center"]')).toBeInTheDocument();
    expect(controls.getByText("Complete the first step").closest("ul")).toBeInTheDocument();
    await waitFor(() => expect(controls.getByRole("img", { name: "Step one roadmap image" })).toHaveAttribute("src", "blob:shared-image"));
    vi.unstubAllGlobals();
  });

  it("converts roadmap text between checklist and numbered rich-text formats", async () => {
    const baseDocument = getPublishedDocuments()[0];
    const roadmap = { ...createBlankContentElement("timeline", 1), steps: [{ title: "Step", text: "First\nSecond", imageUrl: "" }] };
    const view = render(<DocumentBuilder canEdit doc={{ ...baseDocument, contentElements: [roadmap] }} activeTopicId="" onTopicChange={vi.fn()} onSave={vi.fn()} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);
    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    fireEvent.click(controls.getByRole("button", { name: "Checklist" }));
    await waitFor(() => expect(controls.getByRole("textbox", { name: "Step 1 subtext" }).querySelectorAll('input[type="checkbox"]')).toHaveLength(1));
    expect(controls.getByRole("button", { name: "Checklist" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(controls.getByRole("button", { name: "Numbers" }));
    await waitFor(() => expect(controls.getByRole("textbox", { name: "Step 1 subtext" }).querySelector("ol")).toBeInTheDocument());
    expect(controls.getByRole("button", { name: "Numbers" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("DocumentBuilder image galleries", () => {
  it("saves the selected grid layout and repeatable images, then renders the gallery", async () => {
    const fetchMock = installSharedImageFetch("/ppc/api/library/images?pathname=glassco%2Flibrary-images%2Fgallery.png");
    const baseDocument = getPublishedDocuments()[0];
    const gallery = createBlankContentElement("gallery", 1);
    const document = { ...baseDocument, contentElements: [gallery] };
    const onSave = vi.fn().mockResolvedValue(undefined);

    const view = render(<DocumentBuilder canEdit doc={document} activeTopicId="" onTopicChange={vi.fn()} onSave={onSave} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);
    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    fireEvent.change(controls.getByRole("textbox", { name: "Gallery image 1 description" }), { target: { value: "First gallery image" } });
    fireEvent.click(controls.getByRole("button", { name: "3 Grid" }));
    expect(controls.getByRole("textbox", { name: "Gallery image 3 description" })).toBeInTheDocument();
    expect(view.container.querySelector('[data-gallery-columns="3"]')).toBeInTheDocument();
    fireEvent.click(controls.getByRole("button", { name: "Remove gallery image 3" }));
    expect(controls.getByRole("textbox", { name: "Gallery image 3 description" })).toBeInTheDocument();
    fireEvent.change(controls.getByLabelText("Upload gallery image 1"), { target: { files: [new File(["gallery"], "gallery.png", { type: "image/png" })] } });
    await waitFor(() => expect(controls.getByRole("button", { name: "Preview gallery image 1" })).toBeInTheDocument());
    fireEvent.click(controls.getAllByRole("button", { name: "Save changes" })[0]);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const savedGallery = onSave.mock.calls[0][0][0];
    expect(savedGallery.galleryColumns).toBe(3);
    expect(savedGallery.images).toHaveLength(3);
    expect(savedGallery.images[0]).toEqual({ url: expect.stringContaining("/ppc/api/library/images"), alt: "First gallery image" });
    expect(view.container.querySelector('section[data-gallery-columns="3"]')).toBeInTheDocument();
    await waitFor(() => expect(controls.getByRole("img", { name: "First gallery image" })).toHaveAttribute("src", "blob:shared-image"));
    const imageRequestsBeforePreview = fetchMock.mock.calls.filter(([, init]) => init?.method !== "POST").length;
    fireEvent.click(controls.getByRole("button", { name: "Preview First gallery image" }));
    expect(within(controls.getByRole("dialog", { name: "Image preview" })).getByRole("img", { name: "Document feature preview" })).toHaveAttribute("src", "blob:shared-image");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method !== "POST")).toHaveLength(imageRequestsBeforePreview);
    vi.unstubAllGlobals();
  });
});

describe("DocumentBuilder video header", () => {
  it("renders a Google Drive player inside the blue header without a separate open-video button", () => {
    const baseDocument = getPublishedDocuments()[0];
    const document = { ...baseDocument, videoUrl: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing" };
    const view = render(<DocumentBuilder doc={document} activeTopicId="" onTopicChange={vi.fn()} onSave={vi.fn()} onSaveVideoUrl={vi.fn()} />);
    const header = view.container.querySelector("header.reader-header");
    const player = header?.querySelector("iframe");

    expect(header).toBeInTheDocument();
    expect(player).toHaveAttribute("src", "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/preview");
    expect(player?.parentElement?.className).toContain("googleDrivePlayer");
    expect(within(header as HTMLElement).getByRole("link", { name: "Open video tutorial in a new tab" })).toHaveAttribute("href", document.videoUrl);
    expect(view.container.querySelector("article > section[aria-label='Video tutorial']")).not.toBeInTheDocument();
    expect(within(view.container).queryByText("OPEN VIDEO")).not.toBeInTheDocument();
  });
});

describe("DocumentBuilder shared feature images and buttons", () => {
  it("uploads a Feature Card image to shared storage and saves the returned URL", async () => {
    const fetchMock = installSharedImageFetch("/ppc/api/library/images?pathname=glassco%2Flibrary-images%2Ffeature.png");
    const baseDocument = getPublishedDocuments()[0];
    const onSave = vi.fn();
    const view = render(<DocumentBuilder canEdit doc={{ ...baseDocument, contentElements: [createBlankContentElement("feature", 1)] }} activeTopicId="" onTopicChange={vi.fn()} onSave={onSave} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);
    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    fireEvent.change(controls.getByLabelText("Upload feature card image"), { target: { files: [new File(["feature"], "feature.png", { type: "image/png" })] } });
    await waitFor(() => expect(controls.getByRole("button", { name: "Preview feature card image" })).toBeInTheDocument());
    await waitFor(() => expect(controls.getByRole("img", { name: "feature card image preview" })).toHaveAttribute("src", "blob:shared-image"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/library/images?"), expect.objectContaining({ headers: { Authorization: "Bearer test-token" } }));
    fireEvent.click(controls.getAllByRole("button", { name: "Save changes" })[0]);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0][0].imageUrl).toContain("/ppc/api/library/images");
    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    fireEvent.click(controls.getByRole("button", { name: "Remove image" }));
    expect(controls.queryByRole("button", { name: "Preview feature card image" })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("rejects an oversized shared image before making a request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const baseDocument = getPublishedDocuments()[0];
    const view = render(<DocumentBuilder canEdit doc={{ ...baseDocument, contentElements: [createBlankContentElement("feature", 1)] }} activeTopicId="" onTopicChange={vi.fn()} onSave={vi.fn()} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);
    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    const file = new File(["x"], "large.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 2 * 1024 * 1024 + 1 });
    fireEvent.change(controls.getByLabelText("Upload feature card image"), { target: { files: [file] } });
    expect(controls.getByRole("alert")).toHaveTextContent("2 MB or smaller");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("saves a valid standalone Button with width, alignment, and secure new-tab behavior", async () => {
    const baseDocument = getPublishedDocuments()[0];
    const onSave = vi.fn();
    const view = render(<DocumentBuilder canEdit doc={{ ...baseDocument, contentElements: [createBlankContentElement("button", 1)] }} activeTopicId="" onTopicChange={vi.fn()} onSave={onSave} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);
    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    fireEvent.change(controls.getByRole("textbox", { name: "Button text" }), { target: { value: "Open guide" } });
    fireEvent.change(controls.getByRole("textbox", { name: "Link" }), { target: { value: "https://example.com/guide" } });
    fireEvent.click(controls.getByRole("button", { name: "Large" }));
    fireEvent.click(controls.getByRole("button", { name: "Right" }));
    fireEvent.click(controls.getAllByRole("button", { name: "Save changes" })[0]);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0][0];
    expect(saved).toMatchObject({ type: "button", buttonText: "Open guide", buttonUrl: "https://example.com/guide", buttonWidth: "large", buttonAlignment: "right" });
    expect(controls.getByRole("link", { name: "Open guide" })).toHaveAttribute("target", "_blank");
    expect(controls.getByRole("link", { name: "Open guide" })).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows inline feedback for an unsafe Button link", () => {
    const baseDocument = getPublishedDocuments()[0];
    const view = render(<DocumentBuilder canEdit doc={{ ...baseDocument, contentElements: [createBlankContentElement("button", 1)] }} activeTopicId="" onTopicChange={vi.fn()} onSave={vi.fn()} onSaveVideoUrl={vi.fn()} />);
    const controls = within(view.container);
    fireEvent.click(controls.getAllByRole("button", { name: "Switch to edit mode" })[0]);
    fireEvent.change(controls.getByRole("textbox", { name: "Link" }), { target: { value: "javascript:alert(1)" } });
    expect(controls.getByRole("alert")).toHaveTextContent("HTTP, HTTPS, or internal / link");
  });
});
