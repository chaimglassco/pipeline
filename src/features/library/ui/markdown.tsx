import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { Topic } from "../domain/types";
import { slugifyHeading } from "../domain/headings";

type HastNode = { type?: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HastNode[] };
function nodeText(node: HastNode): string { if (node.type === "text") return node.value ?? ""; return node.children?.map(nodeText).join("") ?? ""; }
function deterministicHeadingIds() { return (tree: HastNode) => { const counts = new Map<string, number>(); const visit = (node: HastNode) => { if (node.type === "element" && (node.tagName === "h2" || node.tagName === "h3")) { const base = slugifyHeading(nodeText(node)); const count = counts.get(base) ?? 0; counts.set(base, count + 1); node.properties = { ...node.properties, id: count ? `${base}-${count + 1}` : base }; } node.children?.forEach(visit); }; visit(tree); }; }

export function Markdown({ body, topics, onTopic }: { body:string; topics:Topic[]; onTopic?:(id:string)=>void }) {
  const partNumbers = new Map(topics.filter(topic => topic.level === 2).map((topic, index) => [topic.id, index + 1]));
  const components: Components = {
    h2: ({ children, id }) => <><span className="part-label">PART {id ? partNumbers.get(id) : ""}</span><h2 id={id} tabIndex={-1} onFocus={() => id && onTopic?.(id)}>{children}</h2></>,
    h3: ({ children, id }) => <h3 id={id} tabIndex={-1} onFocus={() => id && onTopic?.(id)}>{children}</h3>,
    a: ({ href, children }) => { const external=href?.startsWith("http"); return <a href={href} target={external?"_blank":undefined} rel={external?"noopener noreferrer":undefined}>{children}{external&&<span className="sr-only"> (opens in a new tab)</span>}</a>; },
    table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
  };
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[deterministicHeadingIds]} components={components}>{body}</ReactMarkdown>;
}
