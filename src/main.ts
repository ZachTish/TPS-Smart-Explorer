import {
  Plugin,
  Notice,
  setIcon,
  PluginSettingTab,
  normalizePath,
  WorkspaceLeaf,
  ItemView,
  Modal,
  parseYaml,
  TFile,
  TFolder,
  MarkdownView
} from "obsidian";
import { SmartExplorerView, VIEW_TYPE_SMART_EXPLORER } from "./smart-explorer-view";
import {
  createRuleCondition,
  getRuleFieldPlaceholder,
  getRuleValuePlaceholder,
  getRuleOperatorsForSource,
  getRuleSources,
} from "./rule-helpers";
import { DEFAULT_ICON_RULES } from "./default-icon-rules";
import { FilterService } from "./filter-service";
import * as logger from "./logger";
import { DeleteConfirmationModal, QuickAddNoteModal, NamePromptModal } from "./modals";
import { CacheManager } from "./cache-manager";
import { TPSExplorerSettingsTab } from "./settings-tab";
import { VisualBuilderModal } from "./visual-builder";
import { FilterEditModal } from "./filter-edit-modal";
import { BasesFilterEditModal } from "./bases-filter-edit-modal";
import { SmartFiltersModal } from "./smart-filters-modal";
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
  parseBaseSort,
} from "./normalizers";

const Ve = "application/x-tps-smart-note";
// Modal classes now imported from ./modals
// All base filter patterns and normalizers imported from ./normalizers



export default class ExplorerPlugin extends Plugin {
  settings: any;
  data: any;
  state: any;

  globallyShowHiddenItems: boolean = false;
  calendarConfig: any;
  iconicData: any;
  _refreshTimer: any;
  filterService: FilterService;

  filterDefinitionsCache: any[] = [];
  filterDefinitionMap: Record<string, any> = {};
  filterDefinitionsSourceRef: any[] | null = null;
  filterDefinitionCacheDirty: boolean = true;
  basesFilterDefsCache: any[] = [];

  /**
   * Parse a .base file and return a filter definition object compatible with Smart Explorer filters.
   * The filter rules are derived from the Bases file's filter configuration.
   */
  async parseBasesFile(basePath: string): Promise<any | null> {
    try {
      const normalizedPath = normalizePath(basePath);
      const file = this.app.vault.getAbstractFileByPath(normalizedPath);
      if (!file || !(file instanceof TFile)) {
        logger.log(`Bases file not found (possibly deleted): ${basePath}`);
        return null;
      }

      const content = await this.app.vault.read(file);
      if (!content) return null;

      // Parse YAML frontmatter (Bases files are YAML)
      let basesConfig: any;
      try {
        basesConfig = parseYaml(content);
      } catch (e) {
        logger.error(`Failed to parse Bases file YAML: ${basePath}`, e);
        return null;
      }

      if (!basesConfig) return null;

      // Build filter rules from Bases filter config
      // Bases files use "filters:" (plural), but also support "filter:" (singular)
      const filterConfig = basesConfig.filters || basesConfig.filter;
      const filterRules = filterConfig ? parseBaseFilterNode(filterConfig) : null;

      // Sort config can be at root level or inside views[0].sort
      let sortConfig = basesConfig.sort;
      if (!sortConfig && Array.isArray(basesConfig.views) && basesConfig.views.length > 0) {
        sortConfig = basesConfig.views[0].sort;
      }
      const sortRules = sortConfig ? parseBaseSort(sortConfig) : [];

      // Extract the base name for the filter name
      const baseName = file.basename.replace(/\.base$/i, "");

      return {
        filterRules,
        sortRules,
        baseName,
        basePath: normalizedPath,
      };
    } catch (e) {
      logger.error(`Error parsing Bases file: ${basePath}`, e);
      return null;
    }
  }

  ensureFilterDefinitionsCache() {
    const filters = Array.isArray(this.settings?.filters)
      ? this.settings.filters
      : [];
    const basesFilters = Array.isArray(this.settings?.basesFilters)
      ? this.settings.basesFilters
      : [];

    if (
      !this.filterDefinitionCacheDirty &&
      this.filterDefinitionsSourceRef === filters
    ) {
      return;
    }
    const definitions = [] as any[];
    const map: Record<string, any> = {};

    // Process regular Smart Filters
    filters.forEach((entry: any, index: number) => {
      if (!entry || typeof entry !== "object") return;
      const id = String(entry.id || entry.name || `filter-${index}`);
      const name = String(entry.name || id);
      const icon = entry.icon || "search";
      const def = { id, name, icon, definition: entry };
      definitions.push(def);
      map[id] = def;
    });

    // Process Bases Filters (these will have their rules loaded dynamically)
    basesFilters.forEach((entry: any, index: number) => {
      if (!entry || typeof entry !== "object") return;
      const id = String(entry.id || `bases-filter-${index}`);
      const name = String(entry.name || entry.basePath || id);
      const icon = entry.icon || "database";

      // Set up defaultFrontmatter for note creation if template is configured
      const definition: any = { ...entry };
      if (entry.templatePath) {
        definition.defaultFrontmatter = {
          _templatePath: entry.templatePath,
          _targetFolder: entry.targetFolder || "",
        };
      }

      // Mark as bases filter for special handling
      const def = {
        id,
        name,
        icon,
        definition,
        isBasesFilter: true,
        basePath: entry.basePath,
      };
      definitions.push(def);
      map[id] = def;
    });

    this.filterDefinitionsCache = definitions;
    this.filterDefinitionMap = map;
    this.filterDefinitionsSourceRef = filters;
    this.filterDefinitionCacheDirty = false;
  }

  getFilterDefinitions() {
    this.ensureFilterDefinitionsCache();
    return this.filterDefinitionsCache || [];
  }

  findFilterDefinition(filterId: string) {
    if (!filterId) return null;
    this.ensureFilterDefinitionsCache();

    // Direct ID Match
    if (this.filterDefinitionMap[filterId]) {
      return this.filterDefinitionMap[filterId];
    }

    // Name Match (Case-insensitive)
    const lowerId = filterId.toLowerCase();
    return this.filterDefinitionsCache.find(d =>
      (d.name && d.name.toLowerCase() === lowerId) ||
      (d.id && d.id.toLowerCase() === lowerId)
    ) || null;
  }

  markFilterDefinitionsDirty() {
    this.filterDefinitionCacheDirty = true;
    this.filterDefinitionsSourceRef = null;
    this.basesFilterRulesLoaded = false;
  }

  basesFilterRulesLoaded: boolean = false;

  openFilterModal(initialFilter: any, onSave: (filter: any) => void) {
    new FilterEditModal(this.app, this, initialFilter, onSave).open();
  }

  /**
   * Loads the filter rules from .base files for all bases filters.
   * Must be called after ensureFilterDefinitionsCache().
   */
  async loadBasesFilterRules() {
    if (this.basesFilterRulesLoaded) return;

    this.ensureFilterDefinitionsCache();

    const definitions = this.filterDefinitionsCache || [];
    for (const def of definitions) {
      if (!def.isBasesFilter || !def.basePath) continue;

      try {
        const parsedBases = await this.parseBasesFile(def.basePath);
        if (parsedBases && parsedBases.filterRules) {
          // Inject the parsed rules into the definition
          // The definition object's "rules" property is what evaluateFilterDefinition uses
          def.definition.rules = parsedBases.filterRules.rules || [];
          def.definition.match = parsedBases.filterRules.match || "all";

          // Also store sort rules if available
          if (parsedBases.sortRules && parsedBases.sortRules.length > 0) {
            def.definition.sortRules = parsedBases.sortRules;
          }

          logger.log(`Loaded bases filter rules for ${def.name}: ${def.definition.rules?.length || 0} rules`);
        } else {
          logger.log(`No filter rules found in bases file: ${def.basePath}`);
          def.definition.rules = [];
        }
      } catch (e) {
        logger.error(`Failed to load bases filter rules for ${def.basePath}`, e);
        def.definition.rules = [];
      }
    }

    this.basesFilterRulesLoaded = true;
  }

  async migrateIconicRules() {
    // Always ensure default icon rules are populated if builders are empty
    const iconBuilder = this.settings.serviceConfig.builders.icon?.default;
    const colorBuilder = this.settings.serviceConfig.builders.color?.default;
    // ...


    const hasIconRules = iconBuilder?.rules && iconBuilder.rules.length > 0;
    const hasColorRules = colorBuilder?.rules && colorBuilder.rules.length > 0;

    if (hasIconRules && hasColorRules) {
      logger.log("Icon and color builders already populated, skipping migration.");
      return;
    }

    logger.log("Populating default icon/color rules to Visual Builder...");

    const iconRules = [];
    const colorRules = [];

    const processRules = (rules, isFolder) => {
      for (const rule of rules) {
        if (!rule.enabled) continue;

        const conditions = [];

        if (isFolder) {
          conditions.push({
            type: "condition",
            source: "extension",
            operator: "!exists",
            value: ""
          });
        } else {
          const hasExtCheck = rule.conditions.some(c => c.source === "extension");
          if (!hasExtCheck) {
            conditions.push({
              type: "condition",
              source: "extension",
              operator: "exists",
              value: ""
            });
          }
        }

        for (const cond of rule.conditions) {
          let source = cond.source;
          let operator = cond.operator;
          let value = cond.value;
          let field = "";

          if (source === "tree") {
            source = "path";
          } else if (source === "tags") {
            source = "tag";
            if (operator === "includes") operator = "contains";
            if (operator === "!includes") operator = "!contains";
          } else if (source.startsWith("property:")) {
            field = source.split(":")[1];
            source = "frontmatter";
            if (operator === "hasValue") operator = "exists";
            if (operator === "!hasValue") operator = "!exists";
          }

          if (operator === "startsWith") operator = "starts";
          if (operator === "!startsWith") operator = "!starts";

          conditions.push({
            type: "condition",
            source,
            field,
            operator,
            value
          });
        }

        const group = {
          type: "group",
          name: rule.name,
          match: rule.match || "all",
          active: true,
          rules: conditions,
          id: rule.id
        };

        if (rule.icon) {
          iconRules.push({
            ...group,
            visualValue: rule.icon
          });
        }
        if (rule.color) {
          colorRules.push({
            ...group,
            visualValue: rule.color
          });
        }
      }
    };

    processRules(DEFAULT_ICON_RULES.fileRules || [], false);
    processRules(DEFAULT_ICON_RULES.folderRules || [], true);

    if (iconRules.length > 0 && !hasIconRules) {
      this.settings.serviceConfig.builders.icon.default = normalizeBuilderDefinition({
        active: true,
        rules: iconRules
      });
      logger.log(`Populated ${iconRules.length} icon rules`);
    }
    if (colorRules.length > 0 && !hasColorRules) {
      this.settings.serviceConfig.builders.color.default = normalizeBuilderDefinition({
        active: true,
        rules: colorRules
      });
      logger.log(`Populated ${colorRules.length} color rules`);
    }

    this.data.migratedIconicRules = true;
    await this.savePluginState();
    logger.log("Default icon/color rules populated.");
  }

  async ensureIntuitiveNames() {
    if (this.data.intuitiveNamesPopulated_v2) return;

    logger.log("Ensuring intuitive names for visual rules (v2)...");
    const builders = this.settings.serviceConfig.builders;

    const processBuilder = (builder) => {
      if (!builder) return;

      // Clear root name
      if (builder.name) {
        builder.name = "";
      }

      if (!Array.isArray(builder.rules)) return;

      for (const rule of builder.rules) {
        if (rule.type !== "group") continue;

        // If name is missing or empty, try to find it
        // OR if it is "Untitled rule", try to find a better one
        if (!rule.name || rule.name.trim() === "" || rule.name === "Untitled rule") {
          let match = null;
          if (DEFAULT_ICON_RULES.fileRules) match = DEFAULT_ICON_RULES.fileRules.find(r => r.id === rule.id);
          if (!match && DEFAULT_ICON_RULES.folderRules) match = DEFAULT_ICON_RULES.folderRules.find(r => r.id === rule.id);

          if (match && match.name) {
            rule.name = match.name;
          } else {
            rule.name = this.generateRuleName(rule);
          }
        }
      }
    };

    processBuilder(builders.icon?.default);
    processBuilder(builders.color?.default);

    // Also process profiles
    if (this.settings.serviceConfig.styleProfiles) {
      for (const category of Object.keys(this.settings.serviceConfig.styleProfiles)) {
        const profiles = this.settings.serviceConfig.styleProfiles[category];
        if (profiles) {
          for (const profileId of Object.keys(profiles)) {
            processBuilder(profiles[profileId]?.builder);
          }
        }
      }
    }
    // processBuilder(builders.text?.default); // Optional

    this.data.intuitiveNamesPopulated_v2 = true;
    await this.savePluginState();
    console.log("Intuitive names populated (v2).");
  }

  generateRuleName(group) {
    if (!group.rules || group.rules.length === 0) return "Empty Rule";

    const conditions = group.rules.filter(r => r.type === "condition");
    if (conditions.length === 0) return "Complex Rule";

    const parts = [];
    for (const c of conditions) {
      if (c.source === "extension" && c.operator === "!exists") {
        parts.push("Folders");
      } else if (c.source === "tag") {
        parts.push(`Tag: ${c.value}`);
      } else if (c.source === "path") {
        parts.push(`Path: ${c.value}`);
      } else if (c.source === "name") {
        parts.push(`Name: ${c.value}`);
      } else if (c.source === "frontmatter") {
        parts.push(`${c.field}: ${c.value}`);
      }
    }

    if (parts.length === 0) return "Custom Rule";
    return parts.join(" & ");
  }

  async migrateFEPPRules() {
    if (this.settings.migratedFEPPRules) return;

    console.log("Migrating FEPP rules...");
    try {
      const adapter = this.app.vault.adapter;
      const feppPath = ".obsidian/plugins/TPS - file-explorer-plus-plus/data.json";

      if (!(await adapter.exists(feppPath))) {
        console.log("FEPP data not found, skipping.");
        return;
      }

      try {
        const feppData = JSON.parse(await adapter.read(feppPath));



        // Migrate Hide Rules
        if (feppData.hideFilters) {
          const hideRules = [];
          const { tags = [], paths = [], compound = [], active = false } = feppData.hideFilters;

          for (const tag of tags) {
            if (!tag.active) continue;
            hideRules.push({
              type: "condition",
              source: "tag",
              operator: "contains",
              value: tag.pattern
            });
          }

          for (const path of paths) {
            if (!path.active) continue;
            const conditions = [{
              type: "condition",
              source: "path",
              operator: "starts",
              value: path.pattern
            }];

            if (path.type === "DIRECTORIES") {
              conditions.push({
                type: "condition",
                source: "extension",
                operator: "!exists",
                value: ""
              });
            } else if (path.type === "FILES") {
              conditions.push({
                type: "condition",
                source: "extension",
                operator: "exists",
                value: ""
              });
            }

            if (conditions.length > 1) {
              hideRules.push({
                type: "group",
                match: "all",
                rules: conditions,
                id: createBuilderId()
              });
            } else {
              hideRules.push(conditions[0]);
            }
          }

          for (const comp of compound) {
            if (!comp.active) continue;
            const rules = [];
            for (const crit of comp.criteria || []) {
              if (crit.type === "PATH") {
                rules.push({
                  type: "condition",
                  source: "path",
                  operator: crit.patternType === "REGEX" ? "matches" : "starts",
                  value: crit.pattern
                });
              } else if (crit.type === "FRONTMATTER") {
                rules.push({
                  type: "condition",
                  source: "frontmatter",
                  field: crit.path,
                  operator: "is",
                  value: crit.pattern
                });
              }
            }
            if (rules.length > 0) {
              hideRules.push({
                type: "group",
                match: "all",
                rules: rules,
                id: createBuilderId()
              });
            }
          }

          if (hideRules.length > 0) {
            this.settings.serviceConfig.builders.hide.default = normalizeBuilderDefinition({
              active: active,
              match: "any",
              rules: hideRules
            });
          }
        }

        // Migrate Sort Rules
        if (feppData.sort) {
          this.settings.serviceConfig.sort.default = {
            active: feppData.sort.active !== false,
            levels: feppData.sort.levels || []
          };

          // Migrate to Builder Config
          const migratedSort = (feppData.sort.levels || []).map(level => {
            let keyType = "frontmatter";
            if (["name", "created", "modified"].includes(level.key)) keyType = level.key;

            let dir = "asc";
            if (level.order === "desc") dir = "desc";

            return {
              keyType,
              key: level.key,
              dir
            };
          });

          this.settings.serviceConfig.builders.sort.default = normalizeBuilderDefinition({
            active: feppData.sort.active !== false,
            match: "all",
            rules: [],
            sort: migratedSort
          });
        }

      } finally {
        this.settings.migratedFEPPRules = true;
        await this.savePluginState();
        console.log("FEPP Migration complete.");
        new Notice("FEPP Migration complete. Please reload settings.");
      }
    } catch (e) {
      console.error("Failed to migrate FEPP rules", e);
    }
  }

  async applyDefaultSortRules() {
    if (this.settings.appliedDefaultSort) return;

    console.log("Applying default sort rules...");

    this.settings.serviceConfig.builders.sort.default = normalizeBuilderDefinition({
      active: true,
      match: "all",
      rules: [],
      sort: [
        { keyType: "frontmatter", key: "status", dir: "asc", customOrder: ["working", "open", "blocked", "complete", "wont-do"] },
        { keyType: "frontmatter", key: "priority", dir: "asc", customOrder: ["high", "medium", "normal", "low"] },
        { keyType: "frontmatter", key: "scheduled", dir: "asc" },
        { keyType: "frontmatter", key: "timeEstimate", dir: "desc" }
      ]
    });

    this.settings.appliedDefaultSort = true;
    await this.savePluginState();
    new Notice("Applied recommended sort rules.");
  }
  async onload() {
    let { app: e } = this;
    ((this.data = await this.loadData()),
      (!this.data || typeof this.data != "object") && (this.data = {}),
      (this.settings = {
        tagTemplatePath:
          this.data.tagTemplatePath || "System/Templates/Root template.md",
        newNoteTemplatePath:
          this.data.newNoteTemplatePath ||
          "@TishOS/System/Templates/Root template.md",
        projectFolderPath: this.data.projectFolderPath || "02 Pages/Projects",
        filters: Array.isArray(this.data.filters) ? this.data.filters : [],
        basesFilters: Array.isArray(this.data.basesFilters) ? this.data.basesFilters : [],
        hideCompleted:
          this.data.hideCompleted !== undefined ? this.data.hideCompleted : true,
        folderExclusions: this.data.folderExclusions || "",
        enableDebugLogging: this.data.enableDebugLogging || false,
        serviceConfig: normalizeServiceConfig(this.data.serviceConfig),
        migratedFEPPRules: this.data.migratedFEPPRules || false,
        appliedDefaultSort: this.data.appliedDefaultSort || false,
      }),
      logger.setLoggingEnabled(this.settings.enableDebugLogging),
      this.ensureServiceBuilders(),
      await this.migrateIconicRules(),
      await this.ensureIntuitiveNames(),
      await this.migrateFEPPRules(),
      await this.applyDefaultSortRules(),
      (this.state = { collapsed: {} }),
      (this.calendarConfig = null),
      await this.loadCalendarConfig(),
      (this.iconicData = DEFAULT_ICON_RULES));
    try {
      await this.loadIconicData();
    } catch { }

    // Load bases filter rules
    try {
      await this.loadBasesFilterRules();
    } catch { }

    this.registerView(VIEW_TYPE_SMART_EXPLORER, (t) => new SmartExplorerView(t, this));
    try {
      if (PluginSettingTab) this.addSettingTab(new TPSExplorerSettingsTab(this.app, this));
    } catch { }
    (this.addCommand({
      id: "open-explorer-2-left",
      name: "Open Explorer 2 (Left Sidebar)",
      callback: () => this.openInSidebar("left"),
    }),
      this.addCommand({
        id: "open-explorer-2-right",
        name: "Open Explorer 2 (Right Sidebar)",
        callback: () => this.openInSidebar("right"),
      }),
      this.addCommand({
        id: "reveal-active-file-in-explorer-2",
        name: "Reveal active file in Explorer 2",
        callback: () => this.revealActiveFile(),
      }),
      this.addCommand({
        id: "inline-rename-file",
        name: "Rename file (inline)",
        callback: () => {
          const activeFile = this.app.workspace.getActiveFile();
          if (activeFile && activeFile.path) {
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_EXPLORER);
            if (leaves.length > 0) {
              const view = leaves[0].view as any;
              if (view && typeof view.queueInlineRename === 'function') {
                view.queueInlineRename(activeFile.path, { clear: false });
              }
            }
          }
        },
      }),
      this.addCommand({
        id: "toggle-hidden-items",
        name: "Toggle Hidden Items",
        callback: () => {
          this.globallyShowHiddenItems = !this.globallyShowHiddenItems;
          this.refreshAllExplorers();
          new Notice(this.globallyShowHiddenItems ? "Hidden items visible" : "Hidden items hidden");
        },
      }),


      this.addCommand({
        id: "standardize-vault",
        name: "Standardize Vault Filenames & Titles",
        callback: () => {
          this.scanAndStandardizeVault();
        },
      }),


      this.addCommand({
        id: "explorer2-force-fepp-migration",
        name: "Force FEPP Migration",
        callback: async () => {
          this.settings.migratedFEPPRules = false;
          await this.migrateFEPPRules();
        },
      }),
      this.addCommand({
        id: "explorer2-focus",
        name: "Focus on Explorer 2",
        callback: () => {
          this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_EXPLORER).forEach((leaf) => {
            this.app.workspace.revealLeaf(leaf);
          });
        },
      }));

    // Initialize Services
    this.filterService = new FilterService(this.app, this);

    // Only register if not already registered
    if (!this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_EXPLORER).length) {
      try {
        this.registerView(VIEW_TYPE_SMART_EXPLORER, (leaf) => new SmartExplorerView(leaf, this));
      } catch (err) {
        // View type already registered, skip
        this.debugLog("View already registered, skipping registration");
      }
    }
    this.addRibbonIcon("folder", "Explorer 2", () => {
      this.activateView();
    });
    try {
      this.registerEvent(
        e.vault.on("modify", (t) => {
          if (t && t.path === ".obsidian/plugins/iconic/data.json") {
            this.loadIconicData()
              .then(() => {
                this.refreshAllExplorer2();
              })
              .catch(() => { });
          }
          const calPath =
            ".obsidian/plugins/Depreciated plugins/TPS-Calendar/data.json";
          if (t && t.path === calPath) {
            this.loadCalendarConfig()
              .then(() => {
                this.refreshAllExplorer2();
              })
              .catch(() => { });
          }
        }),
      );

      this.app.workspace.onLayoutReady(() => {
        this.refreshAllExplorer2();
        this.scanAllFilesForScheduledRename();
      });

      this.registerEvent(
        this.app.metadataCache.on("changed", (file) => {
          this.handleScheduledRename(file);
          if (file?.path) {
            this.filterService?.invalidateFileCache(file.path);
          }
          this.refreshAllExplorer2();
        })
      );

      this.registerEvent(
        this.app.metadataCache.on("resolved", () => this.refreshAllExplorer2())
      );

      // Pre-cache folder filter matches after layout is ready
      this.app.workspace.onLayoutReady(async () => {
        await this.preCacheFolderFilters();
        this.scanAllFilesForScheduledRename();
      });

    } catch { }


  }

  async scanAllFilesForScheduledRename() {
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      await this.handleScheduledRename(file);
    }
  }

  async handleScheduledRename(file: any) {
    const { TFile } = require("obsidian");
    if (!(file instanceof TFile) || !file.path.endsWith(".md")) return;

    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (!frontmatter || !frontmatter.scheduled) return;

    const name = file.basename;
    let currentNameDate = "";
    let namePrefix = "";
    let nameSuffix = "";
    let patternType = "none";

    // Check for "YYYY-MM-DD Title"
    const matchStart = name.match(/^(\d{4}-\d{2}-\d{2})\s+(.*)$/);
    // Check for "Title YYYY-MM-DD"
    const matchEnd = name.match(/^(.*?)\s+(\d{4}-\d{2}-\d{2})$/);

    if (matchStart) {
      currentNameDate = matchStart[1];
      nameSuffix = matchStart[2];
      patternType = "start";
    } else if (matchEnd) {
      namePrefix = matchEnd[1];
      currentNameDate = matchEnd[2];
      patternType = "end";
    } else {
      return; // No date pattern found
    }

    const scheduledVal = frontmatter.scheduled;
    let targetDate = "";

    if (typeof scheduledVal === "string") {
      // Handle ISO format (T) and space-separated time
      targetDate = scheduledVal.split("T")[0].split(" ")[0];
    } else if (scheduledVal instanceof Date) {
      targetDate = scheduledVal.toISOString().split("T")[0];
    } else {
      // Try simple string conversion if it looks like a date
      try {
        const d = new Date(scheduledVal);
        if (!isNaN(d.getTime())) {
          targetDate = d.toISOString().split("T")[0];
        }
      } catch { }
    }

    if (!targetDate) return;

    if (currentNameDate !== targetDate) {
      // Logic for title sync
      let cleanTitle = patternType === "start" ? nameSuffix : namePrefix;
      // Sanitize clean title
      cleanTitle = cleanTitle.replace(/[\\/:*?"<>|]/g, "").trim();

      if (frontmatter.title !== cleanTitle) {
        try {
          // Use processFrontMatter to update title. Note: this is async and might trigger another 'changed' event.
          // We wrap it in a separate floating promise or await it?
          // If we await it, we might want to return after to let the next cycle handle the rename if needed, 
          // but rename depends on scheduled date which didn't change.
          // Let's just do it.
          this.app.fileManager.processFrontMatter(file, (fm) => {
            fm.title = cleanTitle;
          });
        } catch (err) {
          logger.error("Failed to update frontmatter title", err);
        }
      }

      let newName = "";
      if (patternType === "start") {
        newName = `${targetDate} ${nameSuffix}.${file.extension}`;
      } else {
        newName = `${namePrefix} ${targetDate}.${file.extension}`;
      }

      // Sanitize filename: remove invalid chars \ / : * ? " < > |
      newName = newName.replace(/[\\/:*?"<>|]/g, "");

      const newPath = `${file.parent.path}/${newName}`;

      // Prevent overwrite if file exists
      if (await this.app.vault.adapter.exists(newPath)) {
        return;
      }

      try {
        await this.app.fileManager.renameFile(file, newPath);
        new (require("obsidian").Notice)(`Renamed to ${newName}`);
      } catch (err) {
        logger.error("TPS-Smart-Explorer: Failed to rename scheduled note", err);
      }
    }
  }

  async scanAndStandardizeVault() {
    const exclusions = (this.settings.folderExclusions || "")
      .split("\n")
      .map((x: string) => x.trim())
      .filter((x: string) => x);

    const files = this.app.vault.getMarkdownFiles();
    let processedCount = 0;

    new (require("obsidian").Notice)(`Starting vault standardization on ${files.length} files...`);

    for (const file of files) {
      if (exclusions.some((e: string) => file.path.startsWith(e))) continue;

      // Skip Daily Notes (YYYY-MM-DD.md)
      if (/^\d{4}-\d{2}-\d{2}\.md$/.test(file.name)) continue;

      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter || {};

      // Case 1: Has Scheduled Date
      if (frontmatter.scheduled) {
        let scheduledDate = "";
        const scheduledVal = frontmatter.scheduled;

        if (typeof scheduledVal === "string") {
          scheduledDate = scheduledVal.split("T")[0].split(" ")[0];
        } else if (scheduledVal instanceof Date) {
          scheduledDate = scheduledVal.toISOString().split("T")[0];
        } else {
          try {
            const d = new Date(scheduledVal);
            if (!isNaN(d.getTime())) scheduledDate = d.toISOString().split("T")[0];
          } catch { }
        }

        if (scheduledDate) {
          // Determine clean title from current filename
          let currentName = file.basename;
          let cleanTitle = currentName;

          // Check for "YYYY-MM-DD Title"
          const matchStart = currentName.match(/^(\d{4}-\d{2}-\d{2})\s+(.*)$/);
          // Check for "Title YYYY-MM-DD"
          const matchEnd = currentName.match(/^(.*?)\s+(\d{4}-\d{2}-\d{2})$/);

          if (matchStart) {
            cleanTitle = matchStart[2];
          } else if (matchEnd) {
            cleanTitle = matchEnd[1];
          }

          // Sanitize title
          cleanTitle = cleanTitle.replace(/[\\/:*?"<>|]/g, "").trim();

          // 1. Enforce Frontmatter Title = Clean Title
          if (frontmatter.title !== cleanTitle) {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
              fm.title = cleanTitle;
            });
          }

          // 2. Enforce Filename = Title YYYY-MM-DD
          let targetName = `${cleanTitle} ${scheduledDate}.${file.extension}`;

          // Only rename if different
          if (file.name !== targetName) {
            const newPath = `${file.parent.path}/${targetName}`;
            if (!(await this.app.vault.adapter.exists(newPath))) {
              await this.app.fileManager.renameFile(file, newPath);
              processedCount++;
            }
          }
        }
      }

      // Case 2: No Scheduled Date -> Just clean frontmatter title if it has a date
      else if (frontmatter.title) {
        const titleStr = String(frontmatter.title);
        // If title has a date like "Title 2025-01-01" or "2025-01-01 Title", strip it
        const datePattern = /\d{4}-\d{2}-\d{2}/;
        if (datePattern.test(titleStr)) {
          // Strip date
          let cleanTitle = titleStr.replace(datePattern, "").replace(/\s+/g, " ").trim();
          if (cleanTitle !== titleStr) {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
              fm.title = cleanTitle;
            });
            processedCount++;
          }
        }
      }
    }

    new (require("obsidian").Notice)(`Standardization complete. Updated/Renamed ${processedCount} files.`);
  }

  async loadCalendarConfig() {
    try {
      let t = normalizePath(".obsidian/plugins/Depreciated plugins/TPS-Calendar/data.json");
      if (!(await this.app.vault.adapter.exists(t))) {
        this.calendarConfig = null;
        return;
      }
      let r = await this.app.vault.adapter.read(t);
      try {
        this.calendarConfig = JSON.parse(r);
      } catch {
        this.calendarConfig = null;
      }
    } catch {
      this.calendarConfig = null;
    }
  }


  onunload() {
    let { app: e } = this;
    e.workspace.getLeavesOfType(VIEW_TYPE_SMART_EXPLORER).forEach((t) => t.detach());
  }
  async preCacheFolderFilters() {
    try {
      const filters = this.settings.filters || [];
      if (!filters.length) return;

      const view = this.getFirstExplorer2View() as any;
      if (!view || !view.folderMatchesFilter) return;

      // Get all folders in the vault
      const { TFolder } = require("obsidian");
      const folders = this.app.vault.getAllLoadedFiles()
        .filter((f: any) => f instanceof TFolder) as TFolder[];

      // For each filter, pre-cache which folders contain matching files
      for (const filter of filters) {
        if (!filter || !filter.id) continue;
        for (const folder of folders) {
          // This populates folderFilterMatchCache
          if (this.filterService) {
            this.filterService.folderMatchesFilter(folder, filter.definition, filter.id);
          }
        }
      }

      this.debugLog("Pre-cached folder filter matches", {
        filters: filters.length,
        folders: folders.length
      });
    } catch (err) {
      logger.error("Failed to pre-cache folder filters", err);
    }
  }
  async openInSidebar(e) {
    let { app: t } = this,
      n = t.workspace,
      r = e === "left" ? n.getLeftLeaf(!0) : n.getRightLeaf(!0);
    r && (await r.setViewState({ type: VIEW_TYPE_SMART_EXPLORER, active: !0 }), n.revealLeaf(r));
  }
  async savePluginState() {
    logger.setLoggingEnabled(this.settings.enableDebugLogging);
    ((this.data = this.data || {}),
      (this.data.tagTemplatePath = this.settings.tagTemplatePath),
      (this.data.newNoteTemplatePath = this.settings.newNoteTemplatePath),
      (this.data.filters = this.settings.filters || []),
      (this.data.basesFilters = this.settings.basesFilters || []),
      (this.data.projectFolderPath = this.settings.projectFolderPath),
      (this.data.hideCompleted = this.settings.hideCompleted),
      (this.data.folderExclusions = this.settings.folderExclusions),
      (this.data.enableDebugLogging = this.settings.enableDebugLogging),
      (this.data.serviceConfig = this.settings.serviceConfig),
      (this.data.appliedDefaultSort = this.settings.appliedDefaultSort),
      await this.saveData(this.data));
  }
  async saveSettings() {
    await this.savePluginState();
  }
  ensureServiceBuilders() {
    if (!this.settings.serviceConfig)
      this.settings.serviceConfig = normalizeServiceConfig({});
    if (!this.settings.serviceConfig.builders)
      this.settings.serviceConfig.builders = {
        sort: {
          default: normalizeBuilderDefinition({}),
          sections: {},
          filters: {},
        },
        hide: {
          default: normalizeBuilderDefinition({}),
          sections: {},
          filters: {},
        },

      };
    let o = this.settings.serviceConfig.builders;
    for (let e of ["sort", "hide", "icon", "color", "text"]) {
      if (!o[e])
        o[e] = {
          default: normalizeBuilderDefinition({}),
          sections: {},
          filters: {},
        };
      else {
        o[e].default = normalizeBuilderDefinition(o[e].default || {});
        o[e].sections = o[e].sections || {};
        o[e].filters = o[e].filters || {};
      }
      if (["icon", "color", "text", "hide"].includes(e)) {
        // Ensure valid objects exist first
        o[e].file = normalizeBuilderDefinition(o[e].file || {});
        o[e].folder = normalizeBuilderDefinition(o[e].folder || {});

        // One-time Migration: If default has rules, import them to file/folder if they are empty
        // The _migrated flag ensures this only happens once, not on every settings access
        if (o[e].default && o[e].default.rules && o[e].default.rules.length > 0) {
          if (!o[e].file._migrated && (!o[e].file.rules || o[e].file.rules.length === 0)) {
            // Copy default rules to file
            const { id, ...legacyProps } = o[e].default;
            o[e].file = normalizeBuilderDefinition(JSON.parse(JSON.stringify(legacyProps)));
            o[e].file._migrated = true;
          }
          if (!o[e].folder._migrated && (!o[e].folder.rules || o[e].folder.rules.length === 0)) {
            // Copy default rules to folder
            const { id, ...legacyProps } = o[e].default;
            o[e].folder = normalizeBuilderDefinition(JSON.parse(JSON.stringify(legacyProps)));
            o[e].folder._migrated = true;
          }
        }
        // Mark as migrated even if no rules were copied (user explicitly cleared them)
        if (!o[e].file._migrated) o[e].file._migrated = true;
        if (!o[e].folder._migrated) o[e].folder._migrated = true;
      }
    }
    this.ensureStyleProfiles();
  }

  ensureStyleProfiles() {
    const cfg = this.settings.serviceConfig;
    if (!cfg.styleProfiles) cfg.styleProfiles = normalizeStyleProfileMap({});
    if (!cfg.styleAssignments)
      cfg.styleAssignments = normalizeStyleAssignments({});

    // Normalize structure
    cfg.styleProfiles = normalizeStyleProfileMap(cfg.styleProfiles);
    cfg.styleAssignments = normalizeStyleAssignments(cfg.styleAssignments);

    // Migrate legacy section/filter overrides into reusable profiles
    this.migrateLegacyStyleOverrides();
  }



  migrateLegacyStyleOverrides() {
    const cfg = this.settings.serviceConfig;
    const builders = cfg.builders || {};

    const ensureAssignmentEntry = (target, key) => {
      if (!target[key]) target[key] = normalizeStyleAssignmentEntry({});
      target[key] = normalizeStyleAssignmentEntry(target[key]);
    };

    for (const type of STYLE_CATEGORIES) {
      if (!cfg.styleProfiles[type]) cfg.styleProfiles[type] = {};
      const profileMap = cfg.styleProfiles[type];
      const builderEntry = builders[type] || {};

      // Default profile from existing default builder
      if (builderEntry.default && !cfg.styleAssignments.default[type]) {
        const profileId = `${type}-default`;
        if (!profileMap[profileId]) {
          profileMap[profileId] = {
            id: profileId,
            name: `${type[0].toUpperCase()}${type.slice(1)} default`,
            builder: normalizeBuilderDefinition(builderEntry.default),
          };
        }
        cfg.styleAssignments.default[type] = profileId;
      }

      // Section overrides
      const sectionOverrides = builderEntry.sections || {};
      for (const sectionKey of Object.keys(sectionOverrides)) {
        const profileId = `${type}-section-${sectionKey}`;
        if (!profileMap[profileId]) {
          profileMap[profileId] = {
            id: profileId,
            name: `${sectionKey} ${type}`,
            builder: normalizeBuilderDefinition(sectionOverrides[sectionKey]),
          };
        }
        ensureAssignmentEntry(cfg.styleAssignments.sections, sectionKey);
        if (!cfg.styleAssignments.sections[sectionKey][type]) {
          cfg.styleAssignments.sections[sectionKey][type] = profileId;
        }
      }

      // Filter overrides
      const filterOverrides = builderEntry.filters || {};
      for (const filterKey of Object.keys(filterOverrides)) {
        const profileId = `${type}-filter-${filterKey}`;
        if (!profileMap[profileId]) {
          profileMap[profileId] = {
            id: profileId,
            name: `${filterKey} ${type}`,
            builder: normalizeBuilderDefinition(filterOverrides[filterKey]),
          };
        }
        ensureAssignmentEntry(cfg.styleAssignments.filters, filterKey);
        if (!cfg.styleAssignments.filters[filterKey][type]) {
          cfg.styleAssignments.filters[filterKey][type] = profileId;
        }
      }
    }
  }

  getStyleProfiles(type) {
    this.ensureServiceBuilders();
    return this.settings.serviceConfig.styleProfiles?.[type] || {};
  }

  getStyleProfile(type, profileId) {
    const profiles = this.getStyleProfiles(type);
    return profiles?.[profileId] || null;
  }

  upsertStyleProfile(type, profile) {
    if (!STYLE_CATEGORIES.includes(type)) return null;
    this.ensureServiceBuilders();
    const normalized = {
      id: profile.id || `${type}-${createBuilderId()}`,
      name: profile.name || `${type} profile`,
      builder: normalizeBuilderDefinition(profile.builder || {}),
      folderBuilder: normalizeBuilderDefinition(profile.folderBuilder || {}),
      order: profile.order ?? 9999,
    };
    if (!this.settings.serviceConfig.styleProfiles[type]) {
      this.settings.serviceConfig.styleProfiles[type] = {};
    }
    this.settings.serviceConfig.styleProfiles[type][normalized.id] = normalized;
    return normalized;
  }

  deleteStyleProfile(type, profileId) {
    if (!STYLE_CATEGORIES.includes(type)) return;
    this.ensureServiceBuilders();
    const profiles = this.settings.serviceConfig.styleProfiles?.[type];
    if (profiles && Object.prototype.hasOwnProperty.call(profiles, profileId)) {
      delete profiles[profileId];
    }
    const assignments = this.settings.serviceConfig.styleAssignments;
    if (assignments?.default?.[type] === profileId) {
      assignments.default[type] = null;
    }
    for (const scope of ["sections", "filters"]) {
      const map = assignments?.[scope] || {};
      for (const key of Object.keys(map)) {
        if (map[key]?.[type] === profileId) {
          map[key][type] = null;
        }
      }
    }
  }

  setStyleAssignment(scope, key, type, profileId) {
    if (!STYLE_CATEGORIES.includes(type)) return;
    this.ensureServiceBuilders();
    const assignments = this.settings.serviceConfig.styleAssignments;
    const normalizeEntry = (entry) => normalizeStyleAssignmentEntry(entry);
    if (scope === "default") {
      assignments.default = normalizeEntry(assignments.default);
      assignments.default[type] = profileId || null;
      return;
    }
    if (!assignments[scope]) assignments[scope] = {};
    assignments[scope][key] = normalizeEntry(assignments[scope][key]);
    assignments[scope][key][type] = profileId || null;
  }

  getAssignedProfileId(type, context: any = {}) {
    if (!STYLE_CATEGORIES.includes(type)) return null;
    this.ensureServiceBuilders();
    const assignments = this.settings.serviceConfig.styleAssignments || {};
    if (
      context.filterId &&
      assignments.filters &&
      assignments.filters[context.filterId] &&
      assignments.filters[context.filterId][type]
    ) {
      return assignments.filters[context.filterId][type];
    }
    if (
      context.sectionKey &&
      assignments.sections &&
      assignments.sections[context.sectionKey] &&
      assignments.sections[context.sectionKey][type]
    ) {
      return assignments.sections[context.sectionKey][type];
    }
    const assigned = assignments.default ? assignments.default[type] : null;
    if (assigned) return assigned;

    // Fallback: Use the first available profile if one exists
    const profiles = this.settings.serviceConfig.styleProfiles?.[type];
    if (profiles) {
      const keys = Object.keys(profiles);
      if (keys.length > 0) return keys[0];
    }
    return null;
  }

  getProfileBuilderForContext(type, context: any = {}) {
    const profileId = this.getAssignedProfileId(type, context);
    if (!profileId) return null;
    const profile = this.getStyleProfile(type, profileId);
    if (!profile) return null;

    // Handle Scoped Builders within Profile
    if (context.scope === 'folder') {
      return normalizeBuilderDefinition(profile.folderBuilder || {});
    }
    // Default/File scope
    return normalizeBuilderDefinition(profile.builder || {});
  }

  getVisualBuilder(type, scope = "default") {
    this.ensureServiceBuilders();
    const service = this.settings.serviceConfig.builders[type];
    if (!service) return null;

    // Support file/folder scope
    if (scope === "file" || scope === "folder") {
      return service[scope] || service.default || null;
    }

    return service.default || null;
  }
  setVisualBuilder(type, builder, scope = "default") {
    this.ensureServiceBuilders();
    if (!this.settings.serviceConfig.builders[type]) {
      this.settings.serviceConfig.builders[type] = {};
    }

    // Support file/folder scope
    if (scope === "file" || scope === "folder") {
      this.settings.serviceConfig.builders[type][scope] = normalizeBuilderDefinition(
        builder || {},
      );
    } else {
      this.settings.serviceConfig.builders[type].default = normalizeBuilderDefinition(
        builder || {},
      );
    }
  }
  getBuilderDefinition(type, context: any = {}) {
    this.ensureServiceBuilders();
    if (STYLE_CATEGORIES.includes(type)) {
      const profileBuilder = this.getProfileBuilderForContext(type, context);
      // STRICT: For style categories, we ONLY use profiles. 
      // If no profile is found (and no fallback existed), return an empty builder 
      // instead of checking root builders.
      return profileBuilder || normalizeBuilderDefinition({});
    }
    const service = this.settings.serviceConfig.builders[type];
    if (!service) return null;

    // Handle file/folder scope for visual services (icon, color, text)
    if (context.scope && ["file", "folder"].includes(context.scope)) {
      if (Object.prototype.hasOwnProperty.call(service, context.scope)) {
        return service[context.scope];
      }
      // Fallback to default if scope-specific builder doesn't exist
      return service.default || normalizeBuilderDefinition({});
    }

    if (
      context.filterId &&
      service.filters &&
      Object.prototype.hasOwnProperty.call(service.filters, context.filterId)
    ) {
      return service.filters[context.filterId];
    }
    if (
      context.sectionKey &&
      service.sections &&
      Object.prototype.hasOwnProperty.call(service.sections, context.sectionKey)
    ) {
      return service.sections[context.sectionKey];
    }
    return service.default || null;
  }
  getBuilderOverride(type, scope, key) {
    this.ensureServiceBuilders();
    const service = this.settings.serviceConfig.builders[type];
    if (!service) return null;
    if (scope === "default") return service.default;
    // Handle file/folder scope for visual services (icon, color, text) - get directly from service
    if (["file", "folder"].includes(scope) && ["icon", "color", "text"].includes(type)) {
      return service[scope] || null;
    }
    const map = service[scope];
    if (!map) return null;
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
  }
  setBuilderOverride(type, scope, key, builder) {
    this.ensureServiceBuilders();
    const service = this.settings.serviceConfig.builders[type];
    if (!service) return;
    if (scope === "default") {
      service.default = builder ? normalizeBuilderDefinition(builder) : normalizeBuilderDefinition({});
      return;
    }
    // Handle file/folder scope for visual services (icon, color, text) - set directly on service
    if (["file", "folder"].includes(scope) && ["icon", "color", "text"].includes(type)) {
      service[scope] = builder ? normalizeBuilderDefinition(builder) : normalizeBuilderDefinition({});
      return;
    }
    const map = service[scope];
    if (!map) return;
    if (builder) map[key] = normalizeBuilderDefinition(builder);
    else delete map[key];
  }
  async loadIconicData() {
    try {
      let { normalizePath: e } = require("obsidian"),
        t = e(".obsidian/plugins/iconic/data.json");
      if (!(await this.app.vault.adapter.exists(t))) {
        this.iconicData = DEFAULT_ICON_RULES;
        return;
      }
      let r = await this.app.vault.adapter.read(t);
      try {
        this.iconicData = JSON.parse(r);
      } catch {
        this.iconicData = DEFAULT_ICON_RULES;
      }
    } catch {
      this.iconicData = DEFAULT_ICON_RULES;
    }
  }

  refreshAllExplorer2() {
    try {
      (this._refreshTimer && clearTimeout(this._refreshTimer),
        (this._refreshTimer = setTimeout(async () => {
          try {
            this.markFilterDefinitionsDirty();
            // Reload bases filter rules before rendering
            await this.loadBasesFilterRules();
            this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_EXPLORER).forEach((t) => {
              let n = t.view as any;
              if (!n || !n.renderTree) return;
              try {
                typeof n.invalidateFilterMatches === "function" &&
                  n.invalidateFilterMatches();
                n.renderTree("");
              } catch { }
            });
          } catch { }
        }, 120)));
    } catch { }
  }
  revealActiveFile() {
    let { app: e } = this,
      t = e.workspace.getActiveFile();
    if (!t) {
      new (require("obsidian").Notice)("No active file to reveal");
      return;
    }
    let n = this.getFirstExplorer2View();
    if (!n) {
      new (require("obsidian").Notice)("Explorer 2 is not open");
      return;
    }
    (n as any).revealPath(t.path);
  }

  refreshAllExplorers() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_EXPLORER).forEach((leaf) => {
      const view = leaf.view as any;
      if (view && typeof view.invalidateFilterMatches === "function") {
        view.invalidateFilterMatches();
        view.renderTree(view.filterQuery || "");

        // Update action icon if present
        const actionBtn = leaf.view.containerEl.querySelector('.view-action[aria-label="Toggle Hidden Items"], .view-action[aria-label="Show Hidden Items"], .view-action[aria-label="Hide Hidden Items"]');
        if (actionBtn) {
          (require("obsidian").setIcon)(actionBtn, this.globallyShowHiddenItems ? "eye" : "eye-off");
          actionBtn.setAttribute("aria-label", this.globallyShowHiddenItems ? "Hide Hidden Items" : "Show Hidden Items");
        }
      }
    });
  }
  getFirstExplorer2View() {
    let { app: e } = this,
      t = e.workspace.getLeavesOfType(VIEW_TYPE_SMART_EXPLORER);
    if (t.length === 0) return;
    let n = t[0].view;
    if (n && n.getViewType && n.getViewType() === VIEW_TYPE_SMART_EXPLORER) return n;
  }
  shouldLog() {
    return this.settings.debugMode;
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_SMART_EXPLORER);
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeftLeaf(false);
      await leaf.setViewState({
        type: VIEW_TYPE_SMART_EXPLORER,
        active: true,
      });
    }
    workspace.revealLeaf(leaf);
  }

  debugLog(...args: any[]) {
    if (this.shouldLog()) {
      console.log("[Explorer 2]", ...args);
    }
  }
}
