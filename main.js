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
      // if still contains a double bracket
      if(smart_prompt.indexOf("{{") > -1) {
        // get active file
        let active_file = this.app.workspace.getActiveFile();
        // get frontmatter
        let frontmatter = await this.app.metadataCache.getFileCache(active_file);
        // if frontmatter exists
        if(frontmatter) {
          // for each key in frontmatter
          for (const [key, value] of Object.entries(frontmatter.frontmatter)) {
            // if {{key}} is in the template (case-insensitive)
            if(smart_prompt.toLowerCase().indexOf("{{" + key.toLowerCase() + "}}") > -1) {
              // replace {{key}} (case-insensitive) with value
              smart_prompt = smart_prompt.replace(new RegExp("{{" + key + "}}", "gi"), value);
            }
          }
        }
      } 


      // if {{CURRENT_TITLE}} is in the template
      // TODO: add support for {{CURRENT_TITLE}}

      // if any other double brackets are in the template use YAML frontmatter
      // TODO: add support for other double brackets

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

};


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