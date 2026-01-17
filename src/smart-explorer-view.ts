import {
    ItemView,
    WorkspaceLeaf,
    TFile,
    TFolder,
    Notice,
    setIcon,
    normalizePath,
    parseYaml,
    Menu
} from "obsidian";
import ExplorerPlugin from "./main";
import { DeleteConfirmationModal, QuickAddNoteModal, NamePromptModal } from "./modals";
import {
    STYLE_CATEGORIES,
    createBuilderId,
    normalizeSingleSortDef,
    normalizeBucketSortDef,
    normalizeBuilderRule,
    normalizeBuilderDefinition,
    normalizeBuilderMap,
    normalizeStyleProfileMap,
    normalizeStyleAssignmentEntry,
    normalizeStyleAssignmentMap,
    normalizeStyleAssignments,
    normalizeServiceConfig,
    SUPPORTED_BASE_FILTER_PATTERNS,
    parseBaseFilterNode,
    parseBaseSort
} from "./normalizers";

export const VIEW_TYPE_SMART_EXPLORER = "explorer-2";
const DRAG_TYPE_SMART_NOTE = "application/x-tps-smart-note";

// Helper functions for rendering
function renderSection(container: ParentNode, options: any) {
    if (!container) return null;
    const { setIcon: obsidianSetIcon } = require("obsidian");
    let sectionEl = document.createElement("div");
    sectionEl.className = "tree-item nav-folder explorer2-section";
    if (options && options.collapsed) sectionEl.classList.add("is-collapsed");
    if (options && options.key) {
        sectionEl.dataset.path = `explorer2-section://${options.key}`;
        sectionEl.dataset.linkPath = `explorer2-section://${options.key}`;
        sectionEl.dataset.sectionKey = options.key;
    }

    let titleEl = document.createElement("div");
    titleEl.className = "nav-folder-title tree-item-self explorer2-section-title";
    if (options && options.key) {
        titleEl.dataset.path = `explorer2-section://${options.key}`;
        titleEl.dataset.linkPath = `explorer2-section://${options.key}`;
        titleEl.dataset.sectionKey = options.key;
    }

    let collapseIconEl = document.createElement("div");
    collapseIconEl.className = "tree-item-icon collapse-icon nav-folder-collapse-indicator";
    try {
        collapseIconEl.style.position = "static";
        collapseIconEl.style.transform = "none";
        collapseIconEl.style.marginRight = "4px";
        collapseIconEl.style.display = "inline-flex";
        collapseIconEl.style.alignItems = "center";
        collapseIconEl.style.justifyContent = "center";
    } catch { }
    obsidianSetIcon(collapseIconEl, options && options.collapsed ? "chevron-right" : "chevron-down");
    titleEl.appendChild(collapseIconEl);

    let folderIconEl = document.createElement("div");
    folderIconEl.className = "tree-item-icon nav-folder-icon explorer2-icon";
    try {
        folderIconEl.style.position = "static";
        folderIconEl.style.transform = "none";
        folderIconEl.style.marginRight = "2px";
        folderIconEl.style.display = "inline-flex";
        folderIconEl.style.alignItems = "center";
        folderIconEl.style.justifyContent = "center";
        folderIconEl.style.transform = "scale(1.05)";
        folderIconEl.style.transformOrigin = "left center";
    } catch { }
    obsidianSetIcon(folderIconEl, "folder");
    titleEl.appendChild(folderIconEl);

    let nameEl = document.createElement("div");
    nameEl.className = "nav-folder-title-content explorer2-name tree-item-inner";
    nameEl.textContent = options && options.label ? options.label : "";
    try {
        nameEl.style.flex = "1 1 auto";
        nameEl.style.marginLeft = "0";
    } catch { }
    titleEl.appendChild(nameEl);

    try {
        titleEl.style.setProperty("--explorer2-depth", "0");
    } catch { }

    if (options && typeof options.badge == "number") {
        let badgeEl = document.createElement("div");
        badgeEl.className = "explorer2-count";
        badgeEl.textContent = String(options.badge);
        titleEl.appendChild(badgeEl);
    }

    let toggleHandler = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof options?.onToggle == "function") options.onToggle();
    };

    collapseIconEl.addEventListener("click", toggleHandler);
    titleEl.addEventListener("click", toggleHandler);
    if (typeof options?.onContextMenu == "function") {
        titleEl.addEventListener("contextmenu", (e: MouseEvent) => {
            e.preventDefault();
            options.onContextMenu(e);
        });
    }

    sectionEl.appendChild(titleEl);
    let childrenEl = document.createElement("div");
    childrenEl.className = "tree-item-children nav-folder-children explorer2-section-children";
    if (options && options.collapsed) childrenEl.style.display = "none";
    if (options && options.key) childrenEl.dataset.sectionKey = options.key;

    sectionEl.appendChild(childrenEl);
    container.appendChild(sectionEl);
    return { container: sectionEl, childrenEl: childrenEl };
}

function renderTreeItem(container: HTMLElement, options: any) {
    const { setIcon: obsidianSetIcon, Platform } = require("obsidian");
    const isMobile = !!(Platform && (Platform.isMobile || Platform.isMobileApp));
    const doubleClickDelay = isMobile ? 140 : 60;

    let itemEl = document.createElement("div");
    itemEl.className = `tree-item ${options.isFolder ? "nav-folder" : "nav-file"}`;
    if (options.isFolder) {
        if (options.isCollapsed) itemEl.classList.add("is-collapsed");
    }

    if (options.path) {
        itemEl.dataset.path = options.path;
        itemEl.dataset.linkPath = options.path;
    }
    if (options.sectionKey) itemEl.dataset.sectionKey = options.sectionKey;
    if (options.itemType) itemEl.dataset.itemType = options.itemType;
    if (options.selectable) itemEl.classList.add("explorer2-selectable");

    let tags = Array.isArray(options.tags) ? options.tags.filter((t: any) => !!t) : null;
    let tagString = tags && tags.length ? tags.map((t: string) => `#${t.replace(/^#/, "")}`).join(" ") : "";
    if (tagString) {
        itemEl.dataset.tags = tagString;
        itemEl.dataset.linkTags = tagString;
    }

    if (Array.isArray(options.extraClasses)) {
        options.extraClasses.forEach((cls: string) => {
            if (cls) itemEl.classList.add(cls);
        });
    }

    if (options.isFolder && options.depth === 0) itemEl.classList.add("mod-root");

    let selfEl = document.createElement("div");
    selfEl.className = (options.isFolder ? "nav-folder-title" : "nav-file-title") + " tree-item-self";

    try {
        selfEl.style.setProperty("--explorer2-depth", `${options.depth}`);
    } catch {
        selfEl.style.paddingLeft = `${37 + options.depth * 14}px`;
    }

    if (options.path) {
        selfEl.setAttr?.("data-path", options.path);
        if (!selfEl.getAttribute("data-path")) selfEl.setAttribute("data-path", options.path);
        selfEl.dataset.path = options.path;
        selfEl.dataset.linkPath = options.path;
    }
    if (options.sectionKey) selfEl.dataset.sectionKey = options.sectionKey;
    if (tagString) {
        selfEl.dataset.tags = tagString;
        selfEl.dataset.linkTags = tagString;
    }

    let isDragInProgress = false;
    let longPressTimer: any = null;
    let startX = 0;
    let startY = 0;
    let clickTimer: any = null;

    const clearLongPress = () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    const handleSingleClick = (e: MouseEvent) => {
        if (options.onClick) {
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            clickTimer = setTimeout(() => {
                clickTimer = null;
                options.onClick(e);
            }, doubleClickDelay);
        }
    };

    selfEl.addEventListener("click", (e: MouseEvent) => {
        if (isDragInProgress) {
            isDragInProgress = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        e.preventDefault();
        handleSingleClick(e);
    });

    selfEl.addEventListener("contextmenu", (e: MouseEvent) => {
        e.preventDefault();
        if (options.onContextMenu) options.onContextMenu(e);
    });

    if (isMobile && typeof options.onContextMenu === "function") {
        const triggerContextMenu = (e: any) => {
            isDragInProgress = true;
            e.preventDefault?.();
            e.stopPropagation?.();
            const pos = {
                clientX: e.clientX,
                clientY: e.clientY,
                pageX: typeof e.pageX === "number" ? e.pageX : e.clientX,
                pageY: typeof e.pageY === "number" ? e.pageY : e.clientY,
            };
            options.onContextMenu({
                ...pos,
                preventDefault: () => { },
                stopPropagation: () => { },
            });
        };

        const handlePointerDown = (e: PointerEvent) => {
            if (e.button !== 0) return;
            const type = e.pointerType || "";
            if (type && type !== "touch" && type !== "pen") return;

            isDragInProgress = false;
            clearLongPress();
            startX = e.clientX;
            startY = e.clientY;
            longPressTimer = setTimeout(() => {
                longPressTimer = null;
                triggerContextMenu(e);
            }, 450);
        };

        const handlePointerMove = (e: PointerEvent) => {
            if (!longPressTimer) return;
            const dx = Math.abs(e.clientX - startX);
            const dy = Math.abs(e.clientY - startY);
            if (dx > 10 || dy > 10) clearLongPress();
        };

        selfEl.addEventListener("pointerdown", handlePointerDown);
        selfEl.addEventListener("pointermove", handlePointerMove);
        selfEl.addEventListener("pointerup", clearLongPress);
        selfEl.addEventListener("pointercancel", () => { clearLongPress(); isDragInProgress = false; });
        selfEl.addEventListener("pointerleave", () => { clearLongPress(); isDragInProgress = false; });
    }

    if (options.fileRef && options.path) {
        const setupDraggable = (el: HTMLElement) => {
            try {
                el.setAttribute("draggable", "true");
                el.addEventListener("dragstart", (e: DragEvent) => handleDragStart(e, options.path, options.fileRef));
                el.addEventListener("dragend", handleDragEnd);
            } catch { }
        };
        setupDraggable(itemEl);
        setupDraggable(selfEl);
    }

    // Drag and Drop into Folders (Types section)
    if (options.isFolder && options.sectionKey === "types" && options.path) {
        const setupDropTarget = (el: HTMLElement) => {
            el.addEventListener("dragover", (e: DragEvent) => {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                el.classList.add("is-being-dragged-over");
            });
            el.addEventListener("dragleave", () => el.classList.remove("is-being-dragged-over"));
            el.addEventListener("drop", async (e: DragEvent) => {
                e.preventDefault();
                e.stopPropagation();
                el.classList.remove("is-being-dragged-over");
                if ((el as any)._dropInProgress) return;
                (el as any)._dropInProgress = true;
                try {
                    const dragData = (window as any)._tpsSmartFolderDrag;
                    if (!dragData) return;
                    const view = (window as any).app?.workspace?.getLeavesOfType?.(VIEW_TYPE_SMART_EXPLORER)?.[0]?.view;
                    if (!view) return;
                    const selectedFiles = view.getSelectedFiles?.() || [];
                    const draggedFile = (window as any).app?.vault?.getAbstractFileByPath?.(dragData.path);
                    const filesToMove = selectedFiles.length > 0 ? selectedFiles : (draggedFile ? [draggedFile] : []);

                    for (const f of filesToMove) {
                        if (f?.path) await view.moveFileToFolder?.(f, options.path);
                    }
                    view.clearSelection?.();
                } catch (err) {
                    console.error("Drop failed:", err);
                } finally {
                    (el as any)._dropInProgress = false;
                }
            });
        };
        setupDropTarget(itemEl);
        setupDropTarget(selfEl);
    }

    // Drag and Drop into Tags
    if (options.isFolder && options.sectionKey === "tags" && options.fullTag) {
        const setupTagDropTarget = (el: HTMLElement) => {
            el.addEventListener("dragover", (e: DragEvent) => {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
                el.classList.add("is-being-dragged-over");
            });
            el.addEventListener("dragleave", () => el.classList.remove("is-being-dragged-over"));
            el.addEventListener("drop", async (e: DragEvent) => {
                e.preventDefault();
                e.stopPropagation();
                el.classList.remove("is-being-dragged-over");
                if ((el as any)._dropInProgress) return;
                (el as any)._dropInProgress = true;
                try {
                    const dragData = (window as any)._tpsSmartFolderDrag;
                    if (!dragData) return;
                    const view = (window as any).app?.workspace?.getLeavesOfType?.(VIEW_TYPE_SMART_EXPLORER)?.[0]?.view as SmartExplorerView;
                    if (!view) return;
                    const selectedFiles = view.getSelectedFiles?.() || [];
                    const draggedFile = (window as any).app?.vault?.getAbstractFileByPath?.(dragData.path);
                    const filesToTag = selectedFiles.length > 0 ? selectedFiles : (draggedFile ? [draggedFile] : []);

                    const tag = options.fullTag.replace(/^#/, "");
                    await view.bulkUpdateFrontmatter?.(filesToTag, (fm: any) => {
                        const currentTags = Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : []);
                        const normalizedTags = currentTags.map((t: any) => view.normalizeTag?.(t) || String(t).replace(/^#/, ""));
                        const normalizedNewTag = view.normalizeTag?.(tag) || tag;
                        if (!normalizedTags.some((t: string) => t.toLowerCase() === normalizedNewTag.toLowerCase())) {
                            currentTags.push(tag);
                            fm.tags = currentTags;
                        }
                    });
                    view.clearSelection?.();
                    view.ensureRefreshSoon?.();
                } catch (err) {
                    console.error("Tag drop failed:", err);
                } finally {
                    (el as any)._dropInProgress = false;
                }
            });
        };
        setupTagDropTarget(itemEl);
        setupTagDropTarget(selfEl);
    }

    // Drag and Drop into Filters
    if (options.isFolder && options.sectionKey === "filters" && options.path && options.path.startsWith("explorer2-filter://")) {
        const setupFilterDropTarget = (el: HTMLElement) => {
            el.addEventListener("dragover", (e: DragEvent) => {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
                el.classList.add("is-being-dragged-over");
            });
            el.addEventListener("dragleave", () => el.classList.remove("is-being-dragged-over"));
            el.addEventListener("drop", async (e: DragEvent) => {
                e.preventDefault();
                e.stopPropagation();
                el.classList.remove("is-being-dragged-over");
                if ((el as any)._dropInProgress) return;
                (el as any)._dropInProgress = true;
                try {
                    const dragData = (window as any)._tpsSmartFolderDrag;
                    if (!dragData) return;
                    const view = (window as any).app?.workspace?.getLeavesOfType?.(VIEW_TYPE_SMART_EXPLORER)?.[0]?.view as SmartExplorerView;
                    if (!view) return;
                    const selectedFiles = view.getSelectedFiles?.() || [];
                    const draggedFile = (window as any).app?.vault?.getAbstractFileByPath?.(dragData.path);
                    const filesToUpdate = selectedFiles.length > 0 ? selectedFiles : (draggedFile ? [draggedFile] : []);

                    const filterId = options.path.replace("explorer2-filter://", "");
                    const props = view.extractPropertiesFromFilter?.(filterId);
                    if (!props) return;

                    await view.bulkUpdateFrontmatter?.(filesToUpdate, (fm: any) => {
                        if (props.tags && props.tags.length > 0) {
                            const currentTags = Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : []);
                            fm.tags = [...new Set([...currentTags, ...props.tags])];
                        }
                        if (props.frontmatter) Object.assign(fm, props.frontmatter);
                    });
                    view.clearSelection?.();
                    view.ensureRefreshSoon?.();
                } catch (err) {
                    console.error("Filter drop failed:", err);
                } finally {
                    (el as any)._dropInProgress = false;
                }
            });
        };
        setupFilterDropTarget(itemEl);
        setupFilterDropTarget(selfEl);
    }

    // Caret / Collapse Indicator
    if (options.isFolder && options.showCaret !== false) {
        let caretEl = document.createElement("div");
        caretEl.className = "tree-item-icon collapse-icon nav-folder-collapse-indicator";
        try {
            caretEl.style.position = "static";
            caretEl.style.transform = "none";
            caretEl.style.marginRight = "4px";
            caretEl.style.display = "inline-flex";
            caretEl.style.alignItems = "center";
            caretEl.style.justifyContent = "center";
        } catch { }
        obsidianSetIcon(caretEl, options.isCollapsed ? "chevron-right" : "chevron-down");
        caretEl.addEventListener("click", (e: MouseEvent) => {
            e.stopPropagation();
            if (options.onCaretClick) options.onCaretClick();
        });
        selfEl.appendChild(caretEl);
    } else if (options.isFolder) {
        let spacerEl = document.createElement("div");
        spacerEl.className = "tree-item-icon collapse-icon nav-folder-collapse-indicator";
        spacerEl.style.visibility = "hidden";
        try {
            spacerEl.style.display = "inline-flex";
            spacerEl.style.alignItems = "center";
            spacerEl.style.justifyContent = "center";
            spacerEl.style.marginRight = "4px";
        } catch { }
        selfEl.appendChild(spacerEl);
    }

    // Icon
    let iconEl = document.createElement("div");
    iconEl.className = `tree-item-icon ${options.isFolder ? "nav-folder-icon" : "nav-file-icon"} explorer2-icon`;
    try {
        iconEl.style.position = "static";
        iconEl.style.transform = "none";
        iconEl.style.marginRight = "2px";
        iconEl.style.display = "inline-flex";
        iconEl.style.alignItems = "center";
        iconEl.style.justifyContent = "center";
        if (options.isFolder) {
            iconEl.style.transform = "scale(1.05)";
            iconEl.style.transformOrigin = "left center";
        }
    } catch { }

    let iconId = options.iconId;
    if (iconId) {
        const candidates = [iconId];
        if (/^lucide-/.test(iconId)) candidates.push(iconId.replace(/^lucide-/, ""));
        let success = false;
        for (const c of candidates) {
            try {
                obsidianSetIcon(iconEl, c);
                success = true;
                break;
            } catch { }
        }
        if (!success) {
            if (iconId.length <= 3) iconEl.textContent = iconId;
            else obsidianSetIcon(iconEl, options.isFolder ? "folder" : "file");
        }
    } else {
        obsidianSetIcon(iconEl, options.isFolder ? "folder" : "file");
    }

    if (options.iconColor) iconEl.style.color = options.iconColor;
    selfEl.appendChild(iconEl);

    // Name / Content
    let nameEl = document.createElement("div");
    nameEl.className = (options.isFolder ? "nav-folder-title-content" : "nav-file-title-content") + " explorer2-name tree-item-inner";
    try {
        nameEl.style.flex = "1 1 auto";
        nameEl.style.marginLeft = "0";
    } catch { }
    nameEl.textContent = options.name;
    if (options.path) {
        nameEl.dataset.linkPath = options.path;
        nameEl.dataset.path = options.path;
    }
    if (tagString) {
        nameEl.dataset.tags = tagString;
        nameEl.dataset.linkTags = tagString;
    }
    selfEl.appendChild(nameEl);

    if (options.textStyle) {
        options.textStyle.split(";").map((s: string) => s.trim()).filter(Boolean).forEach((s: string) => {
            const parts = s.split(":");
            if (parts.length >= 2) {
                const prop = parts[0].trim();
                const val = parts.slice(1).join(":").trim();
                if (prop && val) (nameEl.style as any)[prop] = val;
            }
        });
    }

    // Badge / Count
    if (options.badge != null) {
        let badgeEl = document.createElement("div");
        badgeEl.className = "explorer2-count";
        badgeEl.textContent = String(options.badge);
        selfEl.appendChild(badgeEl);
    }

    itemEl.appendChild(selfEl);
    let childrenEl: HTMLElement | null = null;
    if (options.isFolder) {
        childrenEl = document.createElement("div");
        childrenEl.className = "tree-item-children nav-folder-children";
        if (options.isCollapsed) childrenEl.style.display = "none";
        itemEl.appendChild(childrenEl);
    }

    container.appendChild(itemEl);
    return { outer: itemEl, childContainer: childrenEl, titleEl: selfEl };
}

function handleDragStart(e: DragEvent, path: string, file: TFile) {
    try {
        if (!e.dataTransfer || !path) return;
        const app = (window as any).app;

        let duration: number | null = null;
        let isAllDay = false;
        try {
            const fm = app?.metadataCache?.getFileCache?.(file)?.frontmatter || {};
            const estimate = Array.isArray(fm.timeEstimate) ? fm.timeEstimate[0] : (fm.timeEstimate ?? fm.duration ?? fm.Duration);
            const parsed = parseInt(estimate, 10);
            if (Number.isFinite(parsed) && parsed > 0) duration = parsed;
            if (fm.allDay === true) isAllDay = true;
        } catch { }

        const dragData = { path, duration, allDay: isAllDay };
        (window as any)._tpsSmartFolderDrag = dragData;
        e.dataTransfer.setData(DRAG_TYPE_SMART_NOTE, JSON.stringify(dragData));
        try {
            e.dataTransfer.setData("text/plain", path);
        } catch { }
        e.dataTransfer.effectAllowed = "copyMove";

        if (typeof e.dataTransfer.setDragImage === "function") {
            const dragImg = document.createElement("div");
            dragImg.textContent = file.name || path.split("/").pop() || "";
            dragImg.className = "explorer2-drag-image";
            document.body.appendChild(dragImg);
            e.dataTransfer.setDragImage(dragImg, 12, 12);
            requestAnimationFrame(() => dragImg.remove());
        }
    } catch (err) {
        console.error("Drag start failed", err);
    }
}

function handleDragEnd() {
    (window as any)._tpsSmartFolderDrag = null;
}

function matchServiceFilters(view: SmartExplorerView, group: any, item: any, isFolder: boolean) {
    try {
        if (!group || typeof group != "object") return false;
        const strictPathsExact =
            !!group.hideStrictPathFilters ||
            !!group.strictPathFilters ||
            !!group.strictPathsExact;
        const normalizePath = (p: string) =>
            typeof p == "string" ? p.replace(/^\/+/, "") : "";
        const path = item?.path || "/";
        const rel = normalizePath(path);
        const parent = (() => {
            if (!rel) return "";
            const idx = rel.lastIndexOf("/");
            return idx === -1 ? "" : rel.slice(0, idx);
        })();
        const ancestors = (() => {
            const values = [];
            let cursor = parent;
            while (cursor) {
                values.push(cursor);
                const idx = cursor.lastIndexOf("/");
                if (idx === -1) break;
                cursor = cursor.slice(0, idx);
            }
            return values;
        })();
        const fileLike = isFolder ? null : item;
        const frontmatter =
            (!isFolder && fileLike
                ? view.app.metadataCache.getFileCache(fileLike)?.frontmatter || null
                : null) || null;
        const tags = !isFolder && fileLike ? view._collectTags(fileLike) : [];

        // Case-insensitive frontmatter lookup helper
        const getFrontmatterVal = (key: string) => {
            if (!frontmatter || !key) return undefined;
            // Try exact match first
            if (Object.prototype.hasOwnProperty.call(frontmatter, key)) return frontmatter[key];
            // Then case-insensitive match
            const lower = key.toLowerCase();
            for (const [k, v] of Object.entries(frontmatter)) {
                if (String(k).toLowerCase() === lower) return v;
            }
            return undefined;
        };
        const matchesPath = (pattern: string, patternType: string, opts: any = {}) => {
            const {
                includeFiles = true,
                includeFolders = true,
                treatDescendants = true,
            } = opts;
            if (!pattern) return false;
            const type = (patternType || "STRICT").toUpperCase();
            if (type === "REGEX") {
                try {
                    const regex = new RegExp(pattern);
                    if (includeFolders && isFolder && regex.test(rel)) return true;
                    if (includeFiles && !isFolder && regex.test(rel)) return true;
                    if (!isFolder && treatDescendants) {
                        if (parent && regex.test(parent)) return true;
                        if (ancestors.some((a) => regex.test(a))) return true;
                    }
                    return false;
                } catch {
                    return false;
                }
            }
            const strictPattern = normalizePath(pattern);
            if (!strictPattern && pattern !== "") return false;
            const matchStrict = (value: string, allowPrefix: boolean) => {
                if (!value && strictPattern) return false;
                const normalized = normalizePath(value);
                if (normalized === strictPattern) return true;
                if (
                    !strictPathsExact &&
                    allowPrefix &&
                    strictPattern &&
                    normalized.startsWith(`${strictPattern}/`)
                )
                    return true;
                return false;
            };
            if (includeFolders && isFolder && matchStrict(rel, true)) return true;
            if (includeFiles && !isFolder && matchStrict(rel, true)) return true;
            if (!isFolder && treatDescendants) {
                if (matchStrict(parent, true)) return true;
                if (!strictPathsExact && ancestors.some((a) => matchStrict(a, true)))
                    return true;
            }
            return false;
        };
        if (Array.isArray(group.paths)) {
            for (const pathConfig of group.paths) {
                if (!pathConfig || pathConfig.active === false) continue;
                const type = (pathConfig.type || "ALL").toUpperCase();
                const includeFiles =
                    type === "ALL" || type === "FILES" || type === "DIRECTORIES";
                const includeFolders = type === "ALL" || type === "DIRECTORIES";
                const treatDescendants = type === "DIRECTORIES" || type === "ALL";
                if (
                    matchesPath(pathConfig.pattern || "", pathConfig.patternType, {
                        includeFiles: !isFolder && includeFiles,
                        includeFolders: isFolder && includeFolders,
                        treatDescendants: !isFolder && treatDescendants,
                    })
                )
                    return true;
            }
        }
        if (!isFolder && Array.isArray(group.tags)) {
            for (const tagConfig of group.tags) {
                if (!tagConfig || tagConfig.active === false) continue;
                const pattern = tagConfig.pattern || tagConfig.name || "";
                if (!pattern) continue;
                if ((tagConfig.patternType || "STRICT").toUpperCase() === "REGEX")
                    try {
                        if (new RegExp(pattern).test(tags.join(" "))) return true;
                    } catch { }
                else if (tags.includes(pattern) || tags.includes(`#${pattern}`))
                    return true;
            }
        }
        if (!isFolder && Array.isArray(group.frontMatter)) {
            for (const fmConfig of group.frontMatter) {
                if (!fmConfig || fmConfig.active === false) continue;
                const key = fmConfig.path || fmConfig.key || "";
                if (!key) continue;
                const value = getFrontmatterVal(key);
                const values = Array.isArray(value)
                    ? value.map((v) => `${v}`)
                    : [`${value ?? ""}`];
                if ((fmConfig.patternType || "STRICT").toUpperCase() === "REGEX") {
                    try {
                        const re = new RegExp(fmConfig.pattern || "");
                        if (values.some((v) => re.test(v))) return true;
                    } catch { }
                } else if (values.some((v) => v === (fmConfig.pattern || "")))
                    return true;
            }
        }
        if (Array.isArray(group.compound)) {
            for (const compound of group.compound) {
                if (!compound || compound.active === false) continue;
                const target = (
                    compound.target ||
                    compound.scope ||
                    compound.type ||
                    "ALL"
                ).toUpperCase();
                if (
                    (target === "FILES" && isFolder) ||
                    (target === "DIRECTORIES" && !isFolder)
                )
                    continue;
                const matches = (compound.criteria || []).every((criterion: any) => {
                    if (!criterion) return false;
                    const criterionType = (criterion.type || "").toUpperCase();
                    if (criterionType === "PATH") {
                        const sense = (
                            criterion.target ||
                            criterion.scope ||
                            criterion.appliesTo ||
                            "ALL"
                        ).toUpperCase();
                        const includeFiles = !isFolder && sense !== "DIRECTORIES";
                        const includeFolders = isFolder && sense !== "FILES";
                        return matchesPath(criterion.pattern || "", criterion.patternType, {
                            includeFiles,
                            includeFolders,
                            treatDescendants: !isFolder,
                        });
                    }
                    if (criterionType === "FRONTMATTER") {
                        if (isFolder) return false;
                        const key = criterion.path || criterion.key || "";
                        if (!key) return false;
                        const value = getFrontmatterVal(key);
                        const candidateValues = Array.isArray(value)
                            ? value.map((v) => `${v}`)
                            : [`${value ?? ""}`];
                        if ((criterion.patternType || "STRICT").toUpperCase() === "REGEX") {
                            try {
                                const re = new RegExp(criterion.pattern || "");
                                return candidateValues.some((v) => re.test(v));
                            } catch {
                                return false;
                            }
                        }
                        return candidateValues.some((v) => v === (criterion.pattern || ""));
                    }
                    return false;
                });
                if (matches) return true;
            }
        }
    } catch { }
    return false;
}

export class SmartExplorerView extends ItemView {
    plugin: ExplorerPlugin;
    headerEl: HTMLElement | null;
    toolbarEl: HTMLElement | null;
    listEl: HTMLElement | null;
    filterQuery: string;
    sortMode: { key: string; dir: string; foldersFirst: boolean };

    filterMatchVersion: number = 0;
    visualMatchVersion: number = 0;

    filterMatchesCache: Map<string, { version: number; files: any[] }> = new Map();
    visualMatchCache: Map<string, any> = new Map();
    serviceMatchCache: Map<string, any> = new Map();
    fileTagCache: Map<string, string[]> = new Map();
    frontmatterCache: Map<string, any> = new Map();
    folderCountCache: Map<string, number> = new Map();
    folderFilterMatchCache: Map<string, boolean> = new Map();
    sortValueCache: Map<string, any> = new Map();

    sectionOrders: Record<string, any[]> = {};
    _scheduledRender: any = null;
    _pendingRename: any = null;
    _pendingRenameTimer: any = null;
    _activeRename: { path: string; input: HTMLInputElement; textEl: HTMLElement; cleanup: () => void } | null = null;
    _activeRenameCommitting: boolean = false;
    _superchargedFrame: any = null;

    menuOutsideHandler: ((e: PointerEvent) => void) | null = null;
    menuKeyHandler: ((e: KeyboardEvent) => void) | null = null;
    activeMenuEl: HTMLElement | null = null;
    activeMenuContext: string | null = null;


    constructor(leaf: WorkspaceLeaf, plugin: ExplorerPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.headerEl = null;
        this.toolbarEl = null;
        this.listEl = null;
        this.filterQuery = "";
        this.sortMode = { key: "name", dir: "asc", foldersFirst: true };
    }

    getViewType(): string {
        return VIEW_TYPE_SMART_EXPLORER;
    }

    getDisplayText(): string {
        return "Smart Explorer";
    }

    getIcon(): string {
        return "folder-search";
    }

    async onOpen() {
        this.registerDomEvent(document, "keydown", (evt: KeyboardEvent) => {
            if (evt.key === "Delete" || evt.key === "Backspace") {
                if (this.app.workspace.getActiveViewOfType(SmartExplorerView) !== this) return;

                // Exclude if user is renaming (check active rename or input focus)
                if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;

                const selectedFiles = this.getSelectedFiles();
                if (selectedFiles.length === 0) return;

                evt.preventDefault();
                new DeleteConfirmationModal(this.app, selectedFiles).open();
            }
        });

        // Ribbon actions
        this.addAction("plus", "Create New Note from Default Template", async () => {
            try {
                const file = await this.createNoteUsingTemplate({
                    baseName: "New Note",
                    startRename: true,
                    clearName: true,
                    shouldOpen: true
                });
                if (file) {
                    new Notice("Note created from default template");
                }
            } catch (err) {
                console.error("Failed to create note from default template:", err);
                new Notice("Failed to create note");
            }
        });

        this.addAction("file-plus-2", "Create New Note from Templater", () => {
            const templater = (this.app as any).plugins?.plugins?.templater;
            if (templater) {
                try {
                    (this.app as any).commands.executeCommandById("templater-obsidian:create-new-note-from-template");
                } catch (err) {
                    console.error("Failed to trigger Templater:", err);
                    new Notice("Failed to trigger Templater. Make sure it's installed and enabled.");
                }
            } else {
                new Notice("Templater plugin not found. Please install and enable it.");
            }
        });

        const content = this.contentEl;
        content.empty();
        this.ensureDragDropStyles();

        const root = content.createDiv({ cls: "explorer2-root" });
        try {
            root.classList.add("nav-files-container");
        } catch { }

        this.headerEl = root.createDiv({ cls: "explorer2-header" });
        this.headerEl.style.display = "flex";
        this.listEl = root.createDiv({ cls: "explorer2-list" });

        this.clearSelection(true);
        this.listEl.addEventListener("click", (e) => {
            if (e.target === this.listEl) this.clearSelection();
        });

        this.renderHeader();
        this.renderTree("");

        // Subscriptions
        this.registerEvent(this.app.vault.on("create", () => this.scheduleRenderRefresh()));
        this.registerEvent(this.app.vault.on("delete", () => this.scheduleRenderRefresh()));
        this.registerEvent(this.app.vault.on("rename", () => this.scheduleRenderRefresh()));
        this.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
                this.plugin.filterService?.invalidateFileCache(file.path);
                this.frontmatterCache.delete(file.path);
                this.fileTagCache.delete(file.path);
                this.scheduleRenderRefresh();
            })
        );

        // Header styles injection
        let styles = document.getElementById("explorer2-header-styles");
        if (!styles) {
            styles = document.createElement("style");
            styles.id = "explorer2-header-styles";
            document.head.appendChild(styles);
        }
        styles.textContent = `
            .explorer2-root {
                display: flex !important;
                flex-direction: column !important;
                height: 100% !important;
                width: 100% !important;
                overflow: hidden !important;
            }
            .explorer2-header {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 6px 4px !important;
                min-height: unset !important;
                flex-shrink: 0 !important;
                background-color: transparent !important;
                border: none !important;
                box-shadow: none !important;
                z-index: 10;
            }
            .explorer2-list {
                flex: 1 !important;
                overflow-y: auto !important;
                overflow-x: hidden !important;
                padding-bottom: 20px;
            }
            .explorer2-header-actions {
                display: flex;
                gap: 2px;
            }
            .explorer2-icon-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border-radius: var(--radius-s);
                color: var(--text-muted);
                background: transparent !important;
                border: none !important;
                height: 26px;
                width: 26px;
                padding: 0;
            }
            .explorer2-icon-btn:hover {
                color: var(--text-normal);
                background-color: var(--background-modifier-hover);
            }
            .explorer2-icon-btn svg {
                width: 18px;
                height: 18px;
            }
        `;
    }

    async onClose() {
        this.clearSelection(true);
        this.closeFileDetailMenu();
        if (this._superchargedFrame) {
            cancelAnimationFrame(this._superchargedFrame);
            this._superchargedFrame = null;
        }
        if (this._pendingRenameTimer) {
            clearTimeout(this._pendingRenameTimer);
            this._pendingRenameTimer = null;
        }
        this._pendingRename = null;
        if (this._scheduledRender) {
            clearTimeout(this._scheduledRender);
            this._scheduledRender = null;
        }
        this.cancelInlineRename();
    }

    renderTree(query: string) {
        if (!this.listEl) return;
        this.plugin.debugLog("renderTree", { filterQuery: query });

        if (this._scheduledRender) {
            clearTimeout(this._scheduledRender);
            this._scheduledRender = null;
        }

        this.cancelInlineRename();
        this.listEl.empty();
        this.filterQuery = query;
        this.sectionOrders = {};

        this.visualMatchCache.clear();
        this.serviceMatchCache.clear();
        this.sortValueCache.clear();
        this.folderCountCache.clear();
        this.folderFilterMatchCache.clear();

        this.renderHeader();
        try {
            this.renderTreeInternal(query);
            this.applySelectionToDOM();
        } catch (err) {
            console.error("Explorer 2 failed to render", err);
            const errorEl = this.listEl.createDiv({ text: "Explorer 2 failed to load." });
            errorEl.style.padding = "12px 16px";
            errorEl.style.color = "var(--text-muted)";
        }
    }

    scheduleRenderRefresh() {
        if (!this.listEl) return;

        if (this._scheduledRender) {
            clearTimeout(this._scheduledRender);
        }

        this._scheduledRender = setTimeout(() => {
            this._scheduledRender = null;

            if (!this.containerEl?.isShown?.()) {
                return;
            }

            this.invalidateFilterMatches();
            try {
                this.renderTree(this.filterQuery);
            } catch (err) {
                console.warn("Explorer 2: scheduled render failed", err);
            }
        }, 500);
    }

    invalidateFilterMatches() {
        this.plugin.debugLog("invalidateFilterMatches");
        this.filterMatchVersion += 1;
        this.filterMatchesCache.clear();
        this.visualMatchVersion += 1;
        this.visualMatchCache.clear();
        this.serviceMatchCache.clear();
        this.fileTagCache.clear();
        this.frontmatterCache.clear();
        this.folderCountCache.clear();
        this.folderFilterMatchCache.clear();
        this.sortValueCache.clear();
    }

    getSelectedFiles(): TFile[] {
        const paths = this.getSelectedFilePaths();
        return paths.map(p => this.app.vault.getAbstractFileByPath(p)).filter(f => f instanceof TFile) as TFile[];
    }

    getSelectedFilePaths(): string[] {
        const selected = this.listEl?.querySelectorAll(".explorer2-selectable.is-selected") || [];
        return Array.from(selected).map((el: any) => el.dataset.path).filter(Boolean);
    }

    clearSelection(skipDOM: boolean = false) {
        if (!skipDOM) {
            this.listEl?.querySelectorAll(".is-selected").forEach(el => el.classList.remove("is-selected"));
        }
    }

    toggleSelection(path: string, event: MouseEvent | null) {
        const multi = event?.shiftKey || event?.ctrlKey || event?.metaKey;
        if (!multi) this.clearSelection();

        const item = this.listEl?.querySelector(`[data-path="${path}"]`);
        if (item) {
            item.classList.toggle("is-selected");
        }
    }

    applySelectionToDOM() {
        // Selection state is currently stored in the DOM classes themselves
        // In the future we might want a backing set.
    }

    ensureRefreshSoon() {
        this.scheduleRenderRefresh();
    }

    renderHeader() {
        if (!this.headerEl) return;
        this.headerEl.empty();

        const actions = this.headerEl.createDiv({ cls: "explorer2-header-actions" });

        // New Note
        const addBtn = actions.createEl("button", {
            cls: "explorer2-icon-btn",
            attr: { "aria-label": "New note" }
        });
        setIcon(addBtn, "plus");
        addBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.quickAddNoteFromHeader();
        });

        // Collapse/Expand
        const isCollapsed = this.isExplorerMostlyCollapsed();
        const collapseBtn = actions.createEl("button", {
            cls: "explorer2-icon-btn",
            attr: { "aria-label": isCollapsed ? "Expand all" : "Collapse all" }
        });

        const collapseIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 19l4-4 4 4"/><path d="M8 5l4 4 4-4"/></svg>`;
        const expandIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3l4 4 4-4"/><path d="M8 21l4-4 4 4"/></svg>`;
        collapseBtn.innerHTML = isCollapsed ? expandIcon : collapseIcon;

        collapseBtn.addEventListener("click", () => {
            if (this.isExplorerMostlyCollapsed()) {
                this.expandAllItems();
            } else {
                this.plugin.state.collapsed = {};
            }
            this.plugin.savePluginState();
            this.plugin.refreshAllExplorers();
        });

        // Show/Hide Hidden
        const eyeBtn = actions.createEl("button", {
            cls: "explorer2-icon-btn",
            attr: { "aria-label": this.plugin.globallyShowHiddenItems ? "Hide Hidden Items" : "Show Hidden Items" }
        });

        const eyeOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        const eyeOff = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
        eyeBtn.innerHTML = this.plugin.globallyShowHiddenItems ? eyeOpen : eyeOff;

        eyeBtn.addEventListener("click", () => {
            this.plugin.globallyShowHiddenItems = !this.plugin.globallyShowHiddenItems;
            this.plugin.refreshAllExplorers();
        });
    }

    isExplorerMostlyCollapsed(): boolean {
        const collapsed = this.plugin.state.collapsed || {};
        const expandedCount = Object.values(collapsed).filter(v => v === false).length;
        return expandedCount < 2;
    }

    expandAllItems() {
        const collapsed: Record<string, boolean> = {};
        const sections = ["folders", "tags", "filters", "all-files", "untagged"];
        sections.forEach(s => collapsed[s] = false);

        const filterDefs = this.plugin.getFilterDefinitions?.() || [];
        filterDefs.forEach((f: any) => {
            if (f.id) collapsed[`filter:${f.id}`] = false;
        });

        const allTags = Object.keys((this.app.metadataCache as any).getTags?.() || {});
        allTags.forEach((tag: string) => {
            const tagKey = tag.startsWith("#") ? tag.substring(1) : tag;
            collapsed[tagKey] = false;
            collapsed[`tag:${tagKey}`] = false;
        });

        this.plugin.state.collapsed = { ...this.plugin.state.collapsed, ...collapsed };
    }

    async quickAddNoteFromHeader() {
        const modal = new QuickAddNoteModal(this.app, {
            titlePlaceholder: "Title",
            folderOptions: this.getQuickAddTypeFolderOptions(),
        });

        const result = await new Promise<{ title: string; folderPath: string } | null>((resolve) => {
            const originalClose = modal.close.bind(modal);
            modal.close = () => {
                originalClose();
                resolve((modal as any).result);
            };
            modal.open();
        });

        if (!result) return;

        try {
            const created = await (this as any).createNoteUsingTemplate({
                baseName: result.title,
                targetFolderPath: result.folderPath || "",
                startRename: false,
                clearName: false,
                shouldOpen: true,
            });
            created && new Notice(`Created ${created.basename}`);
        } catch (err) {
            console.error("Explorer 2 quick add failed", err);
            new Notice("Unable to create note");
        }
    }

    private getQuickAddTypeFolderOptions(): Array<{ label: string; value: string }> {
        const root = this.app.vault.getRoot();
        const options: Array<{ label: string; value: string }> = [
            { label: "Default location", value: "" },
        ];

        const context = { sectionKey: "types" };
        const folders: TFolder[] = [];

        const collectFolders = (folder: TFolder) => {
            folders.push(folder);
            for (const child of folder.children) {
                if (child instanceof TFolder) collectFolders(child);
            }
        };
        collectFolders(root);

        const folderHasMarkdownDirect = (folder: TFolder): boolean => {
            for (const child of folder.children) {
                if (child instanceof TFile && child.extension === "md") return true;
            }
            return false;
        };

        const hasNotesDirect = new Map<TFolder, boolean>();
        for (const f of folders) hasNotesDirect.set(f, folderHasMarkdownDirect(f));

        const descendantHasNotesDirect = new Map<TFolder, boolean>();
        const computeDescendantFlag = (folder: TFolder): boolean => {
            if (descendantHasNotesDirect.has(folder)) return descendantHasNotesDirect.get(folder)!;
            let flag = false;
            for (const child of folder.children) {
                if (child instanceof TFolder) {
                    if (hasNotesDirect.get(child) || computeDescendantFlag(child)) {
                        flag = true;
                        break;
                    }
                }
            }
            descendantHasNotesDirect.set(folder, flag);
            return flag;
        };
        for (const f of folders) computeDescendantFlag(f);

        for (const f of folders) {
            if (f === root) continue;
            if ((this as any).isHidden(f, true, context)) continue;
            if (!f.path) continue;

            if (!hasNotesDirect.get(f)) continue;
            if (descendantHasNotesDirect.get(f)) continue;

            options.push({ label: f.path, value: f.path });
        }

        return [options[0], ...options.slice(1).sort((a, b) => a.label.localeCompare(b.label))];
    }


    renderTreeInternal(query: string) {
        if (!this.listEl) return;

        const root = this.app.vault.getRoot();
        const collapsed = this.plugin.state.collapsed || {};
        const fragment = document.createDocumentFragment();


        // 2. Filters Section
        this.renderFiltersSection(fragment, collapsed);

        // 3. Tags Section
        this.renderTagsSection(fragment, collapsed);

        // 4. Types Section
        this.renderTypesSection(fragment, root, collapsed);

        this.listEl.appendChild(fragment);
        this.applySuperchargedLinksStyling();
        this.tryApplyPendingRename();
    }


    private renderFiltersSection(container: DocumentFragment, collapsed: any) {
        const isCollapsed = collapsed["section:filters"] !== false;
        const filterDefs = this.plugin.getFilterDefinitions?.() || [];

        const filtersWithMatches = filterDefs.map((def: any) => {
            const matches = this.getCachedFilterFiles(def.definition, def.id);
            return { ...def, matches };
        });

        const totalMatches = filtersWithMatches.reduce((sum: number, f: any) => sum + f.matches.length, 0);

        const section = renderSection(container, {
            label: "Filters",
            key: "filters",
            collapsed: isCollapsed,
            badge: totalMatches,
            onToggle: () => {
                this.plugin.state.collapsed["section:filters"] = !isCollapsed;
                this.plugin.savePluginState();
                this.renderTree(this.filterQuery);
            }
        });

        if (section && !isCollapsed) {
            for (const filter of filtersWithMatches) {
                this.renderFilterItem(section.childrenEl, filter, 1, collapsed);
            }
        }
    }

    private renderFilterItem(container: HTMLElement, filter: any, depth: number, collapsed: any) {
        const filterKey = `filter:${filter.id}`;
        const isCollapsed = collapsed[filterKey] !== false;

        const item = renderTreeItem(container, {
            name: filter.name,
            path: `explorer2-filter://${filter.id}`,
            isFolder: true,
            isCollapsed: isCollapsed,
            depth: depth,
            iconId: filter.icon || "filter",
            badge: filter.matches.length,
            onCaretClick: () => {
                this.plugin.state.collapsed[filterKey] = !isCollapsed;
                this.plugin.savePluginState();
                this.renderTree(this.filterQuery);
            },
            onClick: () => {
                this.plugin.state.collapsed[filterKey] = !isCollapsed;
                this.plugin.savePluginState();
                this.renderTree(this.filterQuery);
            }
        });

        if (!isCollapsed && item.childContainer) {
            for (const file of filter.matches) {
                this.renderFileWithMatch(item.childContainer, file, depth + 1, filter.id);
            }
        }
    }

    private renderFileWithMatch(container: HTMLElement, file: TFile, depth: number, filterId?: string, query?: string) {
        const layering = this.evaluateFileLayering(file, query || this.filterQuery, filterId);
        if (!layering.isMatch) return;

        const visuals = this.resolveIconicFor(file.path, false, file);
        renderTreeItem(container, {
            name: file.basename,
            path: file.path,
            isFolder: false,
            isCollapsed: true,
            depth: depth,
            iconId: visuals.id,
            iconColor: visuals.color,
            textStyle: visuals.textStyle,
            fileRef: file,
            onClick: (e: MouseEvent) => {
                this.handleItemActivation(file, e);
            },
            onContextMenu: (e: MouseEvent) => {
                const selectedFiles = this.getSelectedFiles();
                const menu = new Menu();

                if (selectedFiles.length > 1) {
                    this.app.workspace.trigger('files-menu', menu, selectedFiles, 'file-explorer');
                } else {
                    this.app.workspace.trigger('file-menu', menu, file, 'file-explorer');
                }

                menu.showAtMouseEvent(e);
            }
        });
    }

    private renderTagsSection(container: DocumentFragment, collapsed: any) {
        const isCollapsed = collapsed["section:tags"] !== false;
        const tagTreeNodes = this.orderTagTree(this.getTagTreeNodes());

        let totalBadge = 0;
        tagTreeNodes.forEach(node => totalBadge += this.computeTagNodeCount(node));
        const untagged = this.getUntaggedFiles();
        totalBadge += untagged.length;

        const section = renderSection(container, {
            label: "Tags",
            key: "tags",
            collapsed: isCollapsed,
            badge: totalBadge,
            onToggle: () => {
                this.plugin.state.collapsed["section:tags"] = !isCollapsed;
                this.plugin.savePluginState();
                this.renderTree(this.filterQuery);
            }
        });

        if (section && !isCollapsed) {
            if (untagged.length > 0) {
                this.renderUntaggedNode(section.childrenEl, untagged, 1, collapsed);
            }
            for (const node of tagTreeNodes) {
                this.renderTagNodeRecursive(section.childrenEl, node, 1, collapsed);
            }
        }
    }

    private renderUntaggedNode(container: HTMLElement, files: TFile[], depth: number, collapsed: any) {
        const isCollapsed = collapsed["untagged"] !== false;
        const item = renderTreeItem(container, {
            name: "Untagged",
            path: "explorer2-tag://untagged",
            isFolder: true,
            isCollapsed: isCollapsed,
            depth: depth,
            iconId: "tag",
            badge: files.length,
            onCaretClick: () => {
                this.plugin.state.collapsed["untagged"] = !isCollapsed;
                this.plugin.savePluginState();
                this.renderTree(this.filterQuery);
            },
            onClick: () => {
                this.plugin.state.collapsed["untagged"] = !isCollapsed;
                this.plugin.savePluginState();
                this.renderTree(this.filterQuery);
            }
        });

        if (!isCollapsed && item.childContainer) {
            files.sort((a, b) => a.basename.localeCompare(b.basename));
            for (const file of files) {
                this.renderFileItem(item.childContainer, file, depth + 1);
            }
        }
    }

    private renderTagNodeRecursive(container: HTMLElement, node: any, depth: number, collapsed: any) {
        const tagKey = `tag:${node.fullTag}`;
        const isCollapsed = collapsed[tagKey] !== false;
        const badge = this.computeTagNodeCount(node);

        const item = renderTreeItem(container, {
            name: node.display,
            path: `explorer2-tag://${node.fullTag}`,
            isFolder: true,
            isCollapsed: isCollapsed,
            depth: depth,
            iconId: "tag",
            badge: badge,
            onCaretClick: () => {
                this.plugin.state.collapsed[tagKey] = !isCollapsed;
                this.plugin.savePluginState();
                this.renderTree(this.filterQuery);
            },
            onClick: () => {
                this.plugin.state.collapsed[tagKey] = !isCollapsed;
                this.plugin.savePluginState();
                this.renderTree(this.filterQuery);
            }
        });

        if (!isCollapsed && item.childContainer) {
            for (const child of node.children) {
                this.renderTagNodeRecursive(item.childContainer, child, depth + 1, collapsed);
            }
            const sortedFiles = [...node.files].sort((a, b) => a.basename.localeCompare(b.basename));
            for (const file of sortedFiles) {
                this.renderFileItem(item.childContainer, file, depth + 1);
            }
        }
    }

    private renderTypesSection(container: DocumentFragment, root: TFolder, collapsed: any) {
        const isCollapsed = collapsed["section:types"] !== false;
        const typesContext = { sectionKey: "types" };

        // Calculate badge as sum of visible subfolders + files in root
        let totalBadge = 0;
        for (const child of root.children as (TFolder | TFile)[]) {
            const isFolder = child instanceof TFolder;
            const hidden = this.isHidden(child, isFolder, typesContext);

            if (!hidden) {
                if (isFolder) {
                    totalBadge += this.countFolderFiles(child as TFolder, this.filterQuery, typesContext);
                } else if (!this.filterQuery || child.name.toLowerCase().includes(this.filterQuery.toLowerCase())) {
                    totalBadge++;
                }
            }
        }

        const section = renderSection(container, {
            label: "Types",
            key: "types",
            collapsed: isCollapsed,
            badge: totalBadge,
            onToggle: () => {
                this.plugin.state.collapsed["section:types"] = !isCollapsed;
                this.plugin.savePluginState();
                this.renderTree(this.filterQuery);
            }
        });

        if (section && !isCollapsed) {
            const children = [...root.children].sort(this.createContextualComparator(root));
            for (const child of children) {
                if (child instanceof TFolder) {
                    this.renderFolderRecursive(section.childrenEl, child as TFolder, 0, collapsed, typesContext);
                } else if (child instanceof TFile) {
                    this.renderFileItem(section.childrenEl, child as TFile, 0, typesContext);
                }
            }
        }
    }


    getCachedFilterFiles(definition: any, filterId: string): TFile[] {
        const key = filterId || JSON.stringify(definition);
        const cached = this.filterMatchesCache.get(key);
        if (cached && cached.version === this.filterMatchVersion) return cached.files;

        const files = this.getFilesMatchingFilter(definition, filterId);
        this.filterMatchesCache.set(key, { version: this.filterMatchVersion, files });
        return files;
    }

    getFilesMatchingFilter(definition: any, filterId: string) {
        try {
            const files = this.app.vault.getMarkdownFiles();
            const result: TFile[] = [];
            const context = { sectionKey: "filters", filterId };
            const matchedPaths = new Set<string>();
            const fileFilterMatches = new Set<string>();

            for (const file of files) {
                if (this.isHidden(file, false, context)) continue;
                if (this.plugin.filterService.evaluateFilterRule(file, definition)) {
                    result.push(file);
                    matchedPaths.add(file.path);
                    fileFilterMatches.add(file.path);
                }
            }

            (result as any)._fileFilterMatches = fileFilterMatches;
            return result;
        } catch (err) {
            console.error("Explorer 2 filter evaluation failed", err);
            return [];
        }
    }


    renderFolderRecursive(container: HTMLElement, folder: TFolder, depth: number, collapsed: any, context: any = { sectionKey: "folders" }) {
        if (this.isHidden(folder, true, context)) return;

        const folderKey = folder.path;
        const isCollapsed = collapsed[folderKey] !== false;

        const item = renderTreeItem(container, {
            name: folder.name,
            path: folder.path,
            isFolder: true,
            isCollapsed: isCollapsed,
            depth: depth,
            iconId: "folder",
            badge: this.countFolderFiles(folder, this.filterQuery, context),
            onCaretClick: () => {
                this.plugin.state.collapsed[folderKey] = !isCollapsed;
                this.plugin.savePluginState();
                this.renderTree(this.filterQuery);
            },
            onClick: (e: MouseEvent) => {
                // Toggle on click, matching other sections
                this.plugin.state.collapsed[folderKey] = !isCollapsed;
                this.plugin.savePluginState();
                this.renderTree(this.filterQuery);
            },
            onContextMenu: (e: MouseEvent) => {
                // Trigger file-menu event for Global Context Menu plugin
                const menu = new Menu();
                this.app.workspace.trigger('file-menu', menu, folder, 'file-explorer');
                menu.showAtMouseEvent(e);
            }
        });

        if (!isCollapsed && item.childContainer) {
            const children = [...folder.children].sort(this.createContextualComparator(folder));
            for (const child of children) {
                if (child instanceof TFolder) {
                    this.renderFolderRecursive(item.childContainer, child, depth + 1, collapsed, context);
                } else if (child instanceof TFile) {
                    this.renderFileItem(item.childContainer, child, depth + 1, context);
                }
            }
        }
    }

    renderFileItem(container: HTMLElement, file: TFile, depth: number, context: any = {}) {
        if (this.isHidden(file, false, context)) return;

        const visuals = this.getVisualMatchValue(file, context);

        renderTreeItem(container, {
            name: file.basename,
            path: file.path,
            isFolder: false,
            depth: depth,
            iconId: visuals.icon || "file",
            iconColor: visuals.color,
            textStyle: visuals.text,
            fileRef: file,
            onClick: (e: MouseEvent) => {
                this.handleItemActivation(file, e);
            },
            onContextMenu: (e: MouseEvent) => {
                // Check for multi-select
                const selectedFiles = this.getSelectedFiles();
                const menu = new Menu();

                if (selectedFiles.length > 1) {
                    // Multi-select: trigger files-menu event
                    this.app.workspace.trigger('files-menu', menu, selectedFiles, 'file-explorer');
                } else {
                    // Single file: trigger file-menu event
                    this.app.workspace.trigger('file-menu', menu, file, 'file-explorer');
                }

                menu.showAtMouseEvent(e);
            }
        });
    }

    handleItemActivation(item: TFolder | TFile, event: MouseEvent) {
        const multi = event.shiftKey || event.ctrlKey || event.metaKey;
        if (multi) {
            this.toggleSelection(item.path, event);
            return;
        }

        this.clearSelection();
        this.addToSelection(item.path);

        if (item instanceof TFile) {
            this.openFile(item);
        }
    }

    addToSelection(path: string) {
        const item = this.listEl?.querySelector(`[data-path="${path}"]`);
        if (item) item.classList.add("is-selected");
    }

    openFile(file: TFile) {
        this.app.workspace.getLeaf(false).openFile(file);
    }

    // Evaluation Logic
    isHidden(item: TFolder | TFile, isFolder: boolean, context: any = {}): boolean {
        if (this.plugin.globallyShowHiddenItems) return false;

        // Internal/Private check
        if (item.name.startsWith(".")) return true;

        // Cache check
        const cacheKey = `hide:${isFolder ? "folder" : "file"}:${item.path}:${context.sectionKey || ""}:${context.filterId || ""}`;
        if (this.serviceMatchCache.has(cacheKey)) return this.serviceMatchCache.get(cacheKey);

        const check = () => {
            // Check specific builder assigned to this context
            const builder = this.plugin.getProfileBuilderForContext("hide", { ...context, scope: isFolder ? "folder" : "file" });
            if (builder && builder.active !== false) {
                return this.plugin.filterService.evaluateFilterRule(item, builder);
            }

            // Fallback to default hide config
            const hideConfig = this.plugin.settings?.serviceConfig?.builders?.hide;
            if (hideConfig?.default?.active !== false) {
                // If there's a specific section/filter config, use it
                let group = hideConfig.default;
                if (context.sectionKey && hideConfig.sections?.[context.sectionKey]) {
                    group = hideConfig.sections[context.sectionKey];
                } else if (context.filterId && hideConfig.filters?.[context.filterId]) {
                    group = hideConfig.filters[context.filterId];
                }

                if (group && group.active !== false) {
                    return matchServiceFilters(this, group, item, isFolder);
                }
            }

            // Check legacy folder exclusions
            const exclusions = this.plugin.settings?.folderExclusions || "";
            if (exclusions) {
                const paths = exclusions.split("\n").map(p => p.trim()).filter(Boolean);
                if (paths.some(p => item.path.startsWith(p))) return true;
            }

            return false;
        };

        const result = check();
        this.serviceMatchCache.set(cacheKey, result);
        return result;
    }

    getVisualMatchValue(file: TFile, context: any = {}): any {
        const cacheKey = `${file.path}:${context.sectionKey || ''}:${context.filterId || ''}`;
        const cached = this.visualMatchCache.get(cacheKey);
        if (cached) return cached;

        const result = { icon: "file", color: null as string | null, text: null as string | null };

        const effectiveContext = {
            ...context,
            scope: context.scope || "file",
        };

        const getLegacyBuilder = (type: string) => {
            const builders = this.plugin.settings?.serviceConfig?.builders?.[type];
            if (!builders) return null;

            if (effectiveContext.filterId && builders.filters?.[effectiveContext.filterId]) {
                return builders.filters[effectiveContext.filterId];
            }
            if (effectiveContext.sectionKey && builders.sections?.[effectiveContext.sectionKey]) {
                return builders.sections[effectiveContext.sectionKey];
            }

            if (effectiveContext.scope === "folder" && builders.folder) {
                return builders.folder;
            }
            if (effectiveContext.scope === "file" && builders.file) {
                return builders.file;
            }

            return builders.default;
        };

        const getBuilder = (type: string) => {
            const profileBuilder = this.plugin.getProfileBuilderForContext(type, effectiveContext);
            if (profileBuilder) return profileBuilder;
            return getLegacyBuilder(type);
        };

        // Check icon builder
        const iconBuilder = getBuilder("icon");
        if (iconBuilder && iconBuilder.active !== false) {
            const iconMatch = this.getBuilderVisualValue(file, iconBuilder);
            if (iconMatch) result.icon = iconMatch;
        }

        // Check color builder
        const colorBuilder = getBuilder("color");
        if (colorBuilder && colorBuilder.active !== false) {
            const colorMatch = this.getBuilderVisualValue(file, colorBuilder);
            if (colorMatch) result.color = colorMatch;
        }

        // Check text builder
        const textBuilder = getBuilder("text");
        if (textBuilder && textBuilder.active !== false) {
            const textMatch = this.getBuilderVisualValue(file, textBuilder);
            if (textMatch) result.text = textMatch;
        }

        this.visualMatchCache.set(cacheKey, result);
        return result;
    }

    getBuilderVisualValue(file: TFile, builder: any): string | null {
        if (!builder || !Array.isArray(builder.rules)) return null;

        for (const rule of builder.rules) {
            if (rule.type === "group") {
                // For groups, check if all conditions match, then return the group's visualValue
                const groupMatches = this.plugin.filterService.evaluateFilterRule(file, rule);
                if (groupMatches) {
                    // Return the group's visual value if it exists
                    if (rule.visualValue) {
                        return rule.visualValue;
                    }
                    // Otherwise recursively check nested groups
                    const nestedMatch = this.getBuilderVisualValue(file, rule);
                    if (nestedMatch) return nestedMatch;
                }
            } else if (rule.type === "condition") {
                // Check if this rule matches
                if (this.plugin.filterService.evaluateFilterRule(file, rule)) {
                    if (this.plugin.settings?.enableDebugLogging) {
                        console.log(`[Visual] Condition matched:`, rule, `visualValue:`, rule.visualValue);
                    }
                    // Return the visual value if it exists
                    return rule.visualValue || null;
                }
            }
        }

        return null;
    }

    createContextualComparator(folder: TFolder): (a: any, b: any) => number {
        return (a, b) => {
            if (this.sortMode.foldersFirst) {
                if (a instanceof TFolder && !(b instanceof TFolder)) return -1;
                if (!(a instanceof TFolder) && b instanceof TFolder) return 1;
            }
            return a.name.localeCompare(b.name);
        };
    }

    _collectTags(file: TFile): string[] {
        const cached = this.fileTagCache.get(file.path);
        if (cached) return cached;

        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
        const tags = Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : []);
        const normalized = tags.map((t: any) => String(t).replace(/^#/, ""));

        this.fileTagCache.set(file.path, normalized);
        return normalized;
    }

    async openContextMenuForFolder(folder: TFolder, event: MouseEvent) {
        const menu = new Menu();

        menu.addItem(item => {
            item.setTitle("New note")
                .setIcon("plus")
                .onClick(async () => {
                    await this.createNoteUsingTemplate({
                        targetFolderPath: folder.path,
                        startRename: true,
                        shouldOpen: true
                    });
                });
        });

        menu.addItem(item => {
            item.setTitle("New folder")
                .setIcon("folder-plus")
                .onClick(async () => {
                    const name = await this.promptForName("New folder", "Folder name");
                    if (name) {
                        const path = normalizePath(`${folder.path}/${name}`);
                        await this.app.vault.createFolder(path);
                    }
                });
        });

        menu.addSeparator();

        menu.addItem(item => {
            item.setTitle("Rename")
                .setIcon("pencil")
                .onClick(async () => {
                    const newName = await this.promptForName("Rename folder", folder.name);
                    if (newName && newName !== folder.name) {
                        const parent = folder.parent ? folder.parent.path : "";
                        const newPath = normalizePath(parent ? `${parent}/${newName}` : newName);
                        await this.app.fileManager.renameFile(folder, newPath);
                    }
                });
        });

        menu.addItem(item => {
            item.setTitle("Delete")
                .setIcon("trash")
                .onClick(() => {
                    new DeleteConfirmationModal(this.app, [folder]).open();
                });
        });

        menu.showAtMouseEvent(event);
    }

    async openContextMenuForFile(file: TFile, event: MouseEvent) {
        const menu = new Menu();

        menu.addItem(item => {
            item.setTitle("Open")
                .setIcon("file-text")
                .onClick(() => this.openFile(file));
        });

        menu.addItem(item => {
            item.setTitle("Open in new tab")
                .setIcon("file-plus")
                .onClick(() => this.app.workspace.getLeaf('tab').openFile(file));
        });

        menu.addSeparator();

        menu.addItem(item => {
            item.setTitle("Rename")
                .setIcon("pencil")
                .onClick(async () => {
                    const newName = await this.promptForName("Rename file", file.basename);
                    if (newName && newName !== file.basename) {
                        const parent = file.parent ? file.parent.path : "";
                        const newPath = normalizePath(parent ? `${parent}/${newName}.md` : `${newName}.md`);
                        await this.app.fileManager.renameFile(file, newPath);
                    }
                });
        });

        menu.addItem(item => {
            item.setTitle("Make a copy")
                .setIcon("copy")
                .onClick(async () => {
                    const parent = file.parent ? file.parent.path : "";
                    const newPath = normalizePath(parent ? `${parent}/${file.basename} (Copy).md` : `${file.basename} (Copy).md`);
                    await this.app.vault.copy(file, newPath);
                });
        });

        menu.addItem(item => {
            item.setTitle("Delete")
                .setIcon("trash")
                .onClick(() => {
                    new DeleteConfirmationModal(this.app, [file]).open();
                });
        });

        menu.showAtMouseEvent(event);
    }

    async promptForName(title: string, placeholder: string): Promise<string | null> {
        return new Promise(resolve => {
            const modal = new NamePromptModal(this.app, title, placeholder);
            const originalClose = modal.close.bind(modal);
            modal.close = () => {
                originalClose();
                resolve((modal as any).result);
            };
            modal.open();
        });
    }

    async bulkUpdateFrontmatter(files: TFile[], callback: (fm: any) => void) {
        for (const file of files) {
            await this.app.fileManager.processFrontMatter(file, callback);
        }
    }

    normalizeTag(tag: string): string {
        return tag.replace(/^#/, "").toLowerCase();
    }

    ensureDragDropStyles() {
        // Implementation for injecting drag and drop CSS
        let styles = document.getElementById("explorer2-drag-styles");
        if (!styles) {
            styles = document.createElement("style");
            styles.id = "explorer2-drag-styles";
            document.head.appendChild(styles);
        }
        styles.textContent = `
            .is-being-dragged-over {
                background-color: var(--background-modifier-hover);
                outline: 2px dashed var(--interactive-accent);
                outline-offset: -2px;
            }
            .explorer2-drag-image {
                background-color: var(--background-primary);
                border: 1px solid var(--border-color);
                padding: 4px 8px;
                border-radius: 4px;
                box-shadow: var(--shadow-s);
                pointer-events: none;
            }
        `;
    }

    closeFileDetailMenu() {
        if (this.activeMenuEl) {
            this.activeMenuEl.remove();
            this.activeMenuEl = null;
        }
        if (this.menuOutsideHandler) {
            document.removeEventListener("pointerdown", this.menuOutsideHandler, true);
            this.menuOutsideHandler = null;
        }
        if (this.menuKeyHandler) {
            document.removeEventListener("keydown", this.menuKeyHandler, true);
            this.menuKeyHandler = null;
        }
    }

    cancelInlineRename() {
        // Implementation for stopping an active rename
        if (this._activeRename) {
            this._activeRename.cleanup();
            this._activeRename = null;
        }
    }

    evaluateFileLayering(file: TFile, query: string, filterId: string = "") {
        try {
            let displayName = file.basename;
            let isMatch = true;
            let iconOverride = null;
            let colorOverride = null;
            let textOverride = null;
            if (query || filterId) {
                const lowerQuery = (query || "").toLowerCase();
                if (query && !file.name.toLowerCase().includes(lowerQuery)) {
                    isMatch = false;
                }
            }
            return { isMatch, displayName, iconOverride, colorOverride, textOverride, matchedLine: null };
        } catch (err) {
            console.error("evaluateFileLayering error", err);
            return { isMatch: true, displayName: file.basename, iconOverride: null, colorOverride: null, textOverride: null, matchedLine: null };
        }
    }

    async createNoteUsingTemplate(options: any): Promise<TFile | null> {
        const {
            baseName = "New Note",
            targetFolderPath = "",
            startRename = false,
            clearName = false,
            shouldOpen = true,
            templatePath = ""
        } = options;

        let folder = targetFolderPath
            ? this.app.vault.getAbstractFileByPath(targetFolderPath)
            : this.getFolderForCreation();

        if (!(folder instanceof TFolder)) folder = this.app.vault.getRoot();

        // Simplified creation logic for now, should ideally use Templater if available
        const fileName = `${baseName}.md`;
        const filePath = normalizePath(folder.path === "/" ? fileName : `${folder.path}/${fileName}`);

        try {
            const file = await this.app.vault.create(filePath, "");
            if (shouldOpen) await this.openFile(file);
            return file;
        } catch (err) {
            console.error("Failed to create note:", err);
            return null;
        }
    }

    getFolderForCreation(): TFolder {
        const active = this.app.workspace.getActiveFile();
        if (active && active.parent) return active.parent;
        return this.app.vault.getRoot();
    }

    extractPropertiesFromFilter(filterId: string) {
        const filterDef = this.plugin.getFilterDefinitions().find((f: any) => f.id === filterId);
        if (!filterDef || !filterDef.definition) return null;

        const props = {
            tags: [] as string[],
            folder: null as string | null,
            frontmatter: {} as Record<string, any>
        };

        const processRules = (rules: any[]) => {
            for (const rule of rules) {
                if (rule.type === "group" && Array.isArray(rule.rules)) {
                    processRules(rule.rules);
                    continue;
                }

                if (rule.type !== "condition" || !rule.value) continue;

                const source = (rule.source || "frontmatter").toLowerCase();
                const operator = (rule.operator || "is").toLowerCase();
                const field = rule.field?.trim();

                if (["!=", "!is", "!contains", "!exists", "does not contain", "is not"].includes(operator)) continue;

                if (source === "tag") {
                    const values = Array.isArray(rule.value) ? rule.value : [rule.value];
                    for (const val of values) {
                        const normalized = String(val).trim().replace(/^#/, '');
                        if (normalized && !props.tags.includes(normalized)) {
                            props.tags.push(normalized);
                        }
                    }
                } else if (source === "folder" || source === "path") {
                    if (!props.folder && typeof rule.value === "string") {
                        let folderPath = rule.value.trim();
                        if (operator === "starts" || operator === "starts with" || operator === "is" || operator === "contains") {
                            props.folder = folderPath;
                        }
                        if (props.folder) {
                            props.folder = props.folder.replace(/\/$/, '');
                        }
                    }
                } else if (source === "frontmatter" && field) {
                    if (field === "title") continue;
                    if (operator === "exists") {
                        if (!props.frontmatter[field]) {
                            props.frontmatter[field] = "";
                        }
                    } else if (["is", "contains", "starts", "ends", "matches"].includes(operator)) {
                        const value = Array.isArray(rule.value) && rule.value.length === 1
                            ? rule.value[0]
                            : rule.value;
                        props.frontmatter[field] = value;
                    }
                } else if (source === "date" && field) {
                    if (operator === "exists") {
                        props.frontmatter[field] = "";
                    } else if (["is", "on", "after", "before", ">=", "<="].includes(operator)) {
                        let val = rule.value;
                        if (typeof val === "string") {
                            const lower = val.toLowerCase();
                            const { moment } = require("obsidian");
                            if (lower === "today") val = moment().format("YYYY-MM-DDTHH:mm:ss");
                            else if (lower === "yesterday") val = moment().subtract(1, "days").format("YYYY-MM-DDTHH:mm:ss");
                            else if (lower === "tomorrow") val = moment().add(1, "days").format("YYYY-MM-DDTHH:mm:ss");
                        }
                        props.frontmatter[field] = val;
                    }
                }
            }
        };

        const rules = filterDef.definition.rules || [];
        processRules(rules);

        return props;
    }

    getFileDisplayName(file: TFile): string {
        return file.basename;
    }

    resolveIconicFor(path: string, isFolder: boolean, ref: any = null): any {
        // Implementation for icon/color/style resolution based on Iconic or internal rules
        const visuals = isFolder ? { icon: "folder", color: null } : this.getVisualMatchValue(ref || this.app.vault.getAbstractFileByPath(path));
        return {
            id: visuals.icon,
            color: visuals.color,
            textStyle: visuals.text
        };
    }

    countFolderFiles(folder: TFolder, query: string = "", context: any = {}): number {
        // We use a composite key for caching because isHidden depends on context
        const cacheKey = `count:${folder.path}:${context.sectionKey || ""}:${context.filterId || ""}:${query || ""}`;
        const cached = this.folderCountCache.get(cacheKey);
        if (cached !== undefined) return cached;

        let count = 0;
        const recursive = (f: TFolder) => {
            // Only skip subfolders if they are hidden in this context
            if (f !== folder && this.isHidden(f, true, context)) return;

            for (const child of f.children) {
                if (child instanceof TFile) {
                    if (!this.isHidden(child, false, context)) {
                        if (!query || child.name.toLowerCase().includes(query.toLowerCase())) {
                            count++;
                        }
                    }
                } else if (child instanceof TFolder) {
                    recursive(child);
                }
            }
        };
        recursive(folder);

        this.folderCountCache.set(cacheKey, count);
        return count;
    }

    collectFrontmatterTags(file: TFile): string[] {
        return this._collectTags(file);
    }

    getUntaggedFiles(): TFile[] {
        const markdownFiles = this.app.vault.getMarkdownFiles();
        return markdownFiles.filter(file => {
            if (this.isHidden(file, false)) return false;
            const tags = this._collectTags(file);
            return tags.length === 0;
        });
    }

    getTagTreeNodes(): any[] {
        const rootNodes: any[] = [];
        const tagMap: Map<string, any> = new Map();

        const getOrCreateNode = (fullTag: string) => {
            if (tagMap.has(fullTag)) return tagMap.get(fullTag);

            const parts = fullTag.split("/");
            const display = parts[parts.length - 1];
            const node = {
                display,
                fullTag,
                children: [],
                files: [],
                lines: []
            };
            tagMap.set(fullTag, node);

            if (parts.length > 1) {
                const parentTag = parts.slice(0, -1).join("/");
                const parentNode = getOrCreateNode(parentTag);
                parentNode.children.push(node);
            } else {
                rootNodes.push(node);
            }
            return node;
        };

        const markdownFiles = this.app.vault.getMarkdownFiles();
        for (const file of markdownFiles) {
            if (this.isHidden(file, false)) continue;

            const tags = this._collectTags(file);
            for (const tag of tags) {
                const node = getOrCreateNode(tag);
                node.files.push(file);
            }

        }

        return rootNodes;
    }

    orderTagTree(nodes: any[]): any[] {
        nodes.sort((a, b) => a.display.localeCompare(b.display));
        for (const node of nodes) {
            if (node.children.length > 0) this.orderTagTree(node.children);
        }
        return nodes;
    }

    computeTagNodeCount(node: any): number {
        let count = node.files.length;

        for (const child of node.children) {
            count += this.computeTagNodeCount(child);
        }
        return count;
    }

    registerSectionItem(section: string, path: string) {
        if (!this.sectionOrders[section]) this.sectionOrders[section] = [];
        this.sectionOrders[section].push(path);
    }

    applySuperchargedLinksStyling() {
        // Supercharged Links integration
        const plugin = (this.app as any).plugins?.plugins?.["supercharged-links-obsidian"];
        if (plugin?.updateContainer && this.containerEl) {
            if (this._superchargedFrame) cancelAnimationFrame(this._superchargedFrame);
            this._superchargedFrame = requestAnimationFrame(() => {
                try {
                    plugin.updateContainer(this.containerEl, plugin, ".explorer2-name");
                } catch { }
                this._superchargedFrame = null;
            });
        }
    }

    tryApplyPendingRename() {
        if (this._pendingRename) {
            const { path, options } = this._pendingRename;
            this._pendingRename = null;
            // logic for triggering inline rename
        }
    }

}
