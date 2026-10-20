import type { Topic } from "./types";
export function slugifyHeading(value:string){return value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g,"").replace(/\s+/g,"-").replace(/-+/g,"-")}
export function extractTopics(markdown:string):Topic[]{const counts=new Map<string,number>();return [...markdown.matchAll(/^(#{2,3})\s+(.+)$/gm)].map(match=>{const title=match[2].replace(/[*_`]/g,"");const base=slugifyHeading(title);const count=counts.get(base)??0;counts.set(base,count+1);return{id:count?`${base}-${count+1}`:base,title,level:match[1].length}})}
