# TPS Smart Explorer

**Adds a second sidebar tab that mirrors Obsidian's native File Explorer, with extra "smart" behaviors for filtering, sorting, icons, and convenience actions.**

![Obsidian Plugin](https://img.shields.io/badge/dynamic/json-blue?label=Obsidian%20Plugin&query=version)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Build](https://img.shields.io/github/workflows/CI/TPS-Smart-Explorer)

## ✨ Features

### 📁 Dual Explorer View
- **Second Sidebar Panel**: Independent explorer view alongside the native file explorer
- **Sync with Native**: Automatically reflects changes in the main file explorer
- **Workspace Integration**: Seamlessly integrated into Obsidian's workspace system
- **Persistent State**: Maintains view state across Obsidian restarts

### 🎯 Smart Rules Engine
- **Icon Rules**: Automatic icon assignment based on file properties and naming patterns
- **Hide Rules**: Conditional hiding of files and folders based on custom criteria
- **Sort Rules**: Advanced sorting options beyond native capabilities
- **Condition Builders**: Visual rule builder for complex conditions

### 🎨 Visual Customization
- **Style Profiles**: Predefined and custom style configurations
- **Icon Libraries**: Extensive icon support for different file types
- **Conditional Styling**: Apply styles based on file properties
- **Visual Builder**: Drag-and-drop rule configuration interface

### ⚡ Convenience Features
- **Quick Actions**: Context menu options for common file operations
- **Delete Confirmation**: Safe file deletion with trash integration
- **Filter Patterns**: Support for Obsidian Bases-style filtering syntax
- **Cache Management**: Optimized performance with intelligent caching

## 🚀 Installation

### Via BRAT (Recommended for Testing)
1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) in Obsidian
2. Go to Settings → Community Plugins → Add BRAT plugin
3. Add this repository URL: `https://github.com/ZachTish/TPS-Smart-Explorer`
4. Enable "TPS - Smart Explorer" in your installed plugins
5. Open the Smart Explorer from the ribbon icon or command palette

### Via Release (Stable)
1. Download the latest [release](https://github.com/ZachTish/TPS-Smart-Explorer/releases)
2. Extract the contents to your vault's plugins folder
3. Restart Obsidian and enable the plugin
4. Access Smart Explorer from the View menu or command palette

## 📖 Usage

### Getting Started

1. **Open Smart Explorer**: Click the explorer icon in the ribbon or use the command palette
2. **Configure Rules**: Go to Settings → TPS Smart Explorer to set up rules
3. **Customize Display**: Adjust sorting, hiding, and icon preferences
4. **Save Configuration**: Your preferences are automatically saved and applied

### Rule Configuration

#### Icon Rules
- **File Extension**: `.md`, `.pdf`, `.png` → specific icons
- **File Name Patterns**: `README*`, `index*` → folder icons
- **Path Conditions**: `Projects/*` → project folder icon
- **Frontmatter Properties**: `priority: high` → priority indicators

#### Hide Rules
- **System Files**: Hide `.DS_Store`, `Thumbs.db` files
- **Tag-based Hiding**: Files with `#archive` or `#draft` tags
- **Path Exclusions**: Hide entire directories like `node_modules/`, `.git/`
- **Conditional Logic**: Complex boolean expressions for advanced hiding

#### Sort Rules
- **Custom Priority**: Define sorting order for specific file types
- **Date-based Sorting**: Sort by creation, modification, or frontmatter dates
- **Alphabetical Groups**: Group files alphabetically within folders
- **Multi-level Sorting**: Different sorting rules for different folder levels

### Advanced Features

#### Visual Rule Builder
- **Drag-and-Drop**: Intuitive rule creation interface
- **Live Preview**: See rule effects in real-time
- **Rule Testing**: Test rules before applying them globally
- **Import/Export**: Share rule configurations between vaults

#### Bases Integration
- **Filter Support**: Native compatibility with Obsidian Bases filter syntax
- **Column Sorting**: Sort by database columns and values
- **Query Support**: Advanced filtering with query language
- **Performance**: Optimized for large databases

#### Cache Management
- **Smart Caching**: Intelligently cache file metadata
- **Performance Monitoring**: Built-in performance metrics
- **Cache Invalidation**: Automatic cache updates on file changes
- **Memory Optimization**: Efficient memory usage for large vaults

## ⚙️ Settings

### Display Options
- **Show Hidden Files**: Option to display normally hidden files
- **File Size Display**: Show file sizes in the explorer
- **Date Format**: Customize date display format
- **Icon Size**: Adjust icon dimensions and scaling

### Rule Configuration
- **Icon Rule Set**: Choose from predefined or custom icon rules
- **Hide Rule Set**: Configure hiding rules for cleaner interface
- **Sort Rule Set**: Define custom sorting behavior
- **Rule Priority**: Control rule evaluation order

### Performance Settings
- **Cache Size**: Limit cache memory usage
- **Update Frequency**: Configure how often the view refreshes
- **Debounce Timing**: Adjust responsiveness vs performance
- **Debug Mode**: Enable detailed logging for troubleshooting

## 🎯 Use Cases

### **Large Projects**
- Hide irrelevant files to focus on important content
- Custom sorting for better organization
- Visual indicators for different file types

### **Knowledge Management**
- Icon-based visual organization
- Hide system files to reduce clutter
- Custom sorting for knowledge retrieval

### **Development Projects**
- Hide build artifacts and dependencies
- Sort source files by importance
- Visual differentiation between file types

## 🔧 Technical Details

### Architecture
- **Modular Design**: Organized into services and utilities
- **Plugin API**: Uses Obsidian's ItemView and WorkspaceLeaf APIs
- **Event System**: Responds to file changes and workspace events
- **Settings Integration**: Persistent configuration with Obsidian settings

### Performance Features
- **Virtual Scrolling**: Efficient handling of large file lists
- **Lazy Loading**: Load content only when visible
- **Debounced Updates**: Optimized refresh timing
- **Memory Management**: Efficient memory usage patterns

## 📋 Commands

### Explorer Commands
- **Toggle Smart Explorer**: Show/hide the explorer panel
- **Refresh View**: Force refresh of all files and rules
- **Open Settings**: Quick access to plugin configuration
- **Clear Cache**: Clear all cached file data

### File Management
- **New File**: Create new files with templates
- **New Folder**: Create directories with default structure
- **Duplicate File**: Copy files with smart naming
- **Move to Trash**: Safe deletion with confirmation

## 🐛 Troubleshooting

### Common Issues

#### Smart Explorer Not Showing
- Check that the plugin is enabled in Settings → Community Plugins
- Try opening it from the command palette (Ctrl/Cmd + P)
- Restart Obsidian if the view doesn't appear

#### Rules Not Working
- Verify rule syntax in the visual builder
- Check that conditions aren't mutually exclusive
- Test rules with the built-in rule tester

#### Performance Issues
- Reduce cache size in performance settings
- Increase debounce timing for slower systems
- Disable unused rule sets to reduce processing

#### Icons Not Displaying
- Check icon library configuration
- Verify icon file paths are accessible
- Ensure icon rules match your file patterns

### Debug Mode
Enable debug mode to troubleshoot:
- Rule evaluation logs
- Cache performance metrics
- File scanning results
- Error messages and warnings

## 📋 Changelog

### v0.1.0 (2024-01-17)
- ✅ Initial release
- ✅ Dual explorer view functionality
- ✅ Rule-based customization system
- ✅ Visual rule builder
- ✅ Bases integration
- ✅ Performance optimizations

## 🔧 Development

### Building from Source
```bash
# Clone the repository
git clone https://github.com/ZachTish/TPS-Smart-Explorer.git
cd TPS-Smart-Explorer

# Install dependencies
npm install

# Build the plugin
npm run build

# Watch for changes during development
npm run dev
```

### Contributing
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request against the `develop` branch

### Development Guidelines
When contributing to this plugin, follow these priorities:

1. **Code Cleanup**: Remove duplicate logic and dead code
2. **Configuration**: Move hardcoded values to settings
3. **Modularity**: Keep files under 500 lines, extract logic into services
4. **Documentation**: Update README and document design decisions

> **Note**: The `main.ts` file is currently ~9,400 lines. Modularization should be done incrementally.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 🔗 Links

- **Repository**: https://github.com/ZachTish/TPS-Smart-Explorer
- **Issues**: https://github.com/ZachTish/TPS-Smart-Explorer/issues
- **Discussions**: https://github.com/ZachTish/TPS-Smart-Explorer/discussions
- **Releases**: https://github.com/ZachTish/TPS-Smart-Explorer/releases

---

**Made with ❤️ for the Obsidian community**