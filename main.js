var Obsidian = require("obsidian");

var DEFAULT_SETTINGS = {
  templates_folder: "",
};
class SmartPromptsPlugin extends Obsidian.Plugin {
  // constructor
  constructor() {
    super(...arguments);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // load file exclusions if not blank
    // if(this.settings.file_exclusions && this.settings.file_exclusions.length > 0) {
    //   this.file_exclusions = this.settings.file_exclusions.split(",");
    // }
    // // load header exclusions if not blank
    // if(this.settings.header_exclusions && this.settings.header_exclusions.length > 0) {
    //   this.header_exclusions = this.settings.header_exclusions.split(",");
    // }
    // // load path_only if not blank
    // if(this.settings.path_only && this.settings.path_only.length > 0) {
    //   this.path_only = this.settings.path_only.split(",");
    // }
  }
  async save_settings(rerender=false) {
    await this.saveData(this.settings);
    // re-load settings into memory
    await this.loadSettings();
  }
  async onload() {
    await this.loadSettings();
    this.modal = new SmartPromptsModal(this.app, this);
    console.log("loading plugin");
    this.addCommand({
      id: "sp-find-prompts",
      name: "Open Smart Prompts Selector",
      icon: "pencil_icon",
      editorCallback: (editor) => {
        this.modal.start(editor);
      }
    });
    
    this.addSettingTab(new SmartPromptsSettingsTab(this.app, this));

  }
}

class SmartPromptsModal extends Obsidian.FuzzySuggestModal {
  constructor(app, plugin) {
    super(app);
    this.app = app;
    this.plugin = plugin;
    this.setPlaceholder("Type name of a prompt...");
  }
  getItems() {
    if (!this.plugin.settings.templates_folder) {
      return this.app.vault.getMarkdownFiles();
    }
    const folder = this.app.vault.getAbstractFileByPath(this.plugin.settings.templates_folder);
    let files = [];
    Obsidian.Vault.recurseChildren(folder, (file) => {
      if (file instanceof Obsidian.TFile) {
        files.push(file);
      }
    });
    files.sort((a, b) => {
      return a.basename.localeCompare(b.basename);
    });
    if (!files) {
      return [];
    }
    return files;
  }
  getItemText(item) {
    return item.basename;
  }
  async onChooseItem(prompt_template) {
    console.log("prompt chosen", prompt_template);
    // get the template contents
    let smart_prompt = await this.app.vault.cachedRead(prompt_template);
    // if template contains a double bracket
    if(smart_prompt.indexOf("{{") > -1) {
      // if {{CURRENT}} is in the template (case-insensitive)
      if(smart_prompt.toLowerCase().indexOf("{{current}}") > -1) {
        // get the current note contents
        let selection = this.editor.getSelection();
        // if no selection, use the whole note
        if (!selection){
          selection = this.editor.getValue();
        }
        // replace {{CURRENT}} (case-insensitive) with selection.trim()
        smart_prompt = smart_prompt.replace(/{{CURRENT}}/gi, selection.trim());
      }
    }
    // if still contains a double bracket get all context variables and replace them using this.getPropertyValue()
    if(smart_prompt.indexOf("{{") > -1) {
      let active_file = this.app.workspace.getActiveFile();
      await this.awaitDataViewPage(active_file.path);
      // get all variables from inside the double brackets
      let contexts = smart_prompt.match(/{{(.*?)}}/g);
      // for each variable
      for (let i = 0; i < contexts.length; i++) {
        // get the variable name
        let context = contexts[i].replace(/{{|}}/g, "");
        // get the value of the variable
        let value = this.getPropertyValue(context, active_file);
        // replace the variable with the value
        smart_prompt = smart_prompt.replace(new RegExp("{{" + context + "}}", "g"), value);
      }
    }
    // copy to the clipboard
    navigator.clipboard.writeText(smart_prompt);
   }
  
  start(editor) {
    this.editor = editor;
    // get frontmatter
    // console.log("frontmatter", this.frontmatter);
    // get tfile from editor
    // console.log("tfile", this.tfile); 
    console.log(editor);
    this.open();
  }

  async awaitDataViewPage(filePath) {
    const dataview = this.app.plugins.getPlugin('dataview');
    while (dataview && (!dataview.api || !dataview.api.page(filePath))) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  getPropertyValue(property_name, file) {
    const dataview = this.app.plugins.getPlugin('dataview');
    if (!file) {
        return null;
    }
    const dataViewPropertyValue = dataview.api.page(file.path)[property_name];

    if (dataViewPropertyValue) {
        if (dataViewPropertyValue.path) {
            return this.app.metadataCache.getFirstLinkpathDest(dataViewPropertyValue.path, file.path).path;
        }
        const externalLinkMatch = /^\[.*\]\((.*)\)$/gm.exec(dataViewPropertyValue);
        if (externalLinkMatch) {
            return externalLinkMatch[1];
        }
        return dataViewPropertyValue;
    } else {
        const cache = this.app.metadataCache.getFileCache(file);
        return cache.frontmatter[property_name];
    }
  }
}

class SmartPromptsSettingsTab extends Obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const {
      containerEl
    } = this;
    containerEl.empty();
    containerEl.createEl("h2", {
      text: "Smart Prompts Settings"
    });

    new Obsidian.Setting(this.containerEl).setName("Folder location").setDesc("Files in this folder will be available as Smart Prompts. Template variables (ex. {{CURRENT}}) are replaced based on the current note.").addSearch((cb) => {
      cb.setPlaceholder("Example: folder1/folder2").setValue(this.plugin.settings.templates_folder).onChange(async (new_folder) => {
        this.plugin.settings.templates_folder = new_folder;
        await this.plugin.save_settings();
      });
    });

  }
}

module.exports = SmartPromptsPlugin;