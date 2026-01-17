# Line Items Deprecation Plan

## Objective
Hide all line-item functionality behind a feature flag to simplify the codebase and focus on note-level operations. The smallest unit should be a note/file, not individual lines.

## Affected Plugins

### 1. TPS-Smart-Explorer (Dev)
**Line-item features to hide:**
- Line filter UI in filter edit modal
- Line rendering in tree view
- Line-specific visual styles
- Line matching/filtering logic

**Files to modify:**
- `src/filter-edit-modal.ts` - Hide "Line Items" section in filter editor
- `src/smart-explorer-view.ts` - Skip `renderFileWithLines`, use simple file rendering
- `src/filter-service.ts` - Skip line matching when flag is off
- `src/main.ts` - Add feature flag setting

**Changes needed:**
```typescript
// In settings
interface ExplorerSettings {
  enableLineItems?: boolean; // Default: false
  // ... existing settings
}

// In filter-edit-modal.ts
if (this.plugin.settings.enableLineItems) {
  // Show line items UI
}

// In smart-explorer-view.ts
if (this.plugin.settings.enableLineItems && hasLineRules) {
  this.renderFileWithLines(...);
} else {
  this.renderFileItem(...); // Simple file rendering
}
```

---

### 2. TPS-Global-Context-Menu (Dev)
**Line-item features to hide:**
- Line edit service (checkbox toggle, strikethrough, etc.)
- Line-specific context menu options
- Line scheduling

**Files to modify:**
- `src/line-edit-service.ts` - Entire service behind flag
- `src/menu-controller.ts` - Hide line-specific menu items
- `src/main.ts` - Add feature flag

**Changes needed:**
```typescript
// In menu-controller.ts
if (this.plugin.settings.enableLineItems) {
  // Add line-specific menu items
}

// Skip line edit service initialization if flag is off
```

---

### 3. TPS-Calendar-Base (Dev)
**Line-item features to hide:**
- Line schedule service
- Line-level event rendering
- Line-specific date parsing

**Files to modify:**
- `src/services/line-schedule-service.ts` - Entire service behind flag
- `src/calendar-view.tsx` - Skip line event rendering
- `src/main.ts` - Add feature flag

**Changes needed:**
```typescript
// In calendar-view.tsx
if (this.plugin.settings.enableLineItems) {
  // Render line-level events
}

// Only initialize line-schedule-service if flag is on
```

---

### 4. TPS-Notifier (Dev)
**Line-item features to hide:**
- Line-level reminders
- Line-specific notifications

**Files to modify:**
- `src/main.ts` - Add feature flag
- `src/notification-view.ts` - Skip line-level notifications

**Changes needed:**
```typescript
// Skip line-level reminder checks if flag is off
if (!this.settings.enableLineItems) {
  return; // Skip line processing
}
```

---

## Implementation Steps

### Phase 1: Add Feature Flag (All Plugins)
1. Add `enableLineItems: false` to default settings in each plugin
2. Add toggle in settings UI (hidden/advanced section)
3. Test that plugins load with flag off

### Phase 2: Wrap Line-Item UI (Smart Explorer & Context Menu)
1. Wrap line filter UI in conditional
2. Wrap line context menu items in conditional
3. Test that UI elements are hidden

### Phase 3: Skip Line-Item Logic (All Plugins)
1. Add early returns in line processing functions
2. Skip line service initialization
3. Use simple file rendering instead of line rendering
4. Test that everything works at note-level

### Phase 4: Cleanup & Documentation
1. Add comments marking line-item code
2. Update README files
3. Document how to re-enable if needed

---

## Code Markers
Use consistent comments to mark line-item code:
```typescript
// LINE-ITEMS: Start - Remove or simplify when deprecating
// ... line-item code ...
// LINE-ITEMS: End
```

---

## Testing Checklist
- [ ] Smart Explorer shows files only (no line items)
- [ ] Filters work at file level
- [ ] Context menu shows file operations only
- [ ] Calendar shows file-level events only
- [ ] Notifier shows file-level reminders only
- [ ] Visual styles apply to files only
- [ ] No console errors with flag off

---

## Rollback Plan
If line-items are needed later:
1. Set `enableLineItems: true` in settings
2. All functionality should work as before
3. Code remains in place, just conditionally disabled
