import type { NavigationPage } from "../core/navigation";
import { getValueAtPath } from "../core/document";

export type StoredNavigation = {
  version: 1;
  rootSourceId: string;
  pages: NavigationPage[];
  pinnedAnchor: NavigationPage | null;
  closedStackFlowPage: NavigationPage | null;
};

// 只保存导航元数据，不保存文档、引用快照或未提交草稿。
function pageMetadata(page: NavigationPage): NavigationPage {
  return { sourceId: page.sourceId, path: [...page.path], navLabel: page.navLabel, isReference: page.isReference };
}

function parsePage(value: unknown): NavigationPage {
  if (!value || typeof value !== "object") throw new Error("页面记录无效");
  const page = value as NavigationPage;
  if (typeof page.sourceId !== "string" || !Array.isArray(page.path)
    || !page.path.every((part) => typeof part === "string" || (typeof part === "number" && Number.isInteger(part) && part >= 0))
    || (page.navLabel !== undefined && typeof page.navLabel !== "string")
    || (page.isReference !== undefined && typeof page.isReference !== "boolean")) throw new Error("页面路径无效");
  return pageMetadata(page);
}

export function readNavigation(storageKey: string | undefined, rootSourceId: string, documents: Record<string, unknown>): { navigation?: StoredNavigation; error?: string } {
  if (!storageKey) return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return {};
    const saved = JSON.parse(raw) as StoredNavigation;
    if (saved.version !== 1 || saved.rootSourceId !== rootSourceId || !Array.isArray(saved.pages) || !saved.pages.length) throw new Error("导航记录版本或根文档不匹配");
    const pages = saved.pages.map(parsePage);
    if (pages[0].sourceId !== rootSourceId || pages[0].path.length) throw new Error("根页面记录无效");
    const pinnedAnchor = saved.pinnedAnchor === null ? null : parsePage(saved.pinnedAnchor);
    const closedStackFlowPage = saved.closedStackFlowPage === null ? null : parsePage(saved.closedStackFlowPage);
    for (const page of [...pages, ...(pinnedAnchor ? [pinnedAnchor] : []), ...(closedStackFlowPage ? [closedStackFlowPage] : [])]) {
      if (!(page.sourceId! in documents) || getValueAtPath(documents[page.sourceId!], page.path) === undefined) throw new Error("原页面对应的数据已不存在");
    }
    return { navigation: { version: 1, rootSourceId, pages, pinnedAnchor, closedStackFlowPage } };
  } catch (error) {
    return { error: "页面位置恢复失败：" + (error instanceof Error ? error.message : String(error)) };
  }
}

export function writeNavigation(storageKey: string, navigation: StoredNavigation): void {
  window.localStorage.setItem(storageKey, JSON.stringify({
    ...navigation,
    pages: navigation.pages.map(pageMetadata),
    pinnedAnchor: navigation.pinnedAnchor ? pageMetadata(navigation.pinnedAnchor) : null,
    closedStackFlowPage: navigation.closedStackFlowPage ? pageMetadata(navigation.closedStackFlowPage) : null,
  }));
}
