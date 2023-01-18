var Obsidian = require("obsidian");

var DEFAULT_SETTINGS = {
  folder: "smart prompts",
  auto_submit: true,
  initial_prompt: "You are role-playing as Socrates, please help me with an Issue in my life. Please ask me questions to try to understand what my issue is and help me unpack it. You can start the conversation however you feel is best. Please end your responses with /e.",
  initial_prompt_enabled: true,
  file_focus_prompt: "",
  auto_prompt_on_file_focus: false,
  file_focus_exceptions: "",
};
class SmartPromptsPlugin extends Obsidian.Plugin {
  // constructor
  constructor() {
    super(...arguments);
    this.selection = null;
    this.file_focus_prompt_template = null;
    this.status_bar = null;
    this.countdown_ct = 10;
    this.countdown_interval = null;
    this.file_focus_exceptions = [];

  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // get file from name in settings.file_focus_prompt
    if(this.settings.file_focus_prompt != "") {
      let path = this.settings.folder+"/"+this.settings.file_focus_prompt;
      // add .md if it is not already there
      if(!path.endsWith(".md")) {
        path += ".md";
      }
      const file = await this.app.vault.getAbstractFileByPath(path);
      if(file instanceof Obsidian.TFile) {
        this.file_focus_prompt_template = file;
      }
    }
    // if file_focus_exceptions is not empty
    if(this.settings.file_focus_exceptions.length > 0) {
      // split the string by commas
      // trim each element
      // remove empty elements
      this.file_focus_exceptions = this.settings.file_focus_exceptions.split(",").map((e) => e.trim()).filter((e) => e != "");
    }
  }
  async save_settings() {
    await this.saveData(this.settings);
    // re-load settings into memory
    await this.loadSettings();
  }
  async onload() {
    this.modal = new SmartPromptsModal(this.app, this);
    console.log("loading plugin");
    this.addCommand({
      id: "sp-find-prompts",
      name: "Open Smart Prompts Selector",
      icon: "bot",
      hotkeys: [{ modifiers: ["Alt"], key: "j" }],
      editorCallback: (editor) => {
        // get the selection from the active context
        this.selection = editor.getSelection();
        // if no selection, use the whole note
        if (!this.selection){
          this.selection = editor.getValue();
        }
        this.modal.open();
      }
    });
    // register smart prompts selector that uses the current selection from clipboard
    this.addCommand({
      id: "sp-find-prompts-clipboard",
      name: "Open Smart Prompts Selector (Clipboard)",
      icon: "bot",
      hotkeys: [{ modifiers: ["Alt"], key: "g" }],
      callback: async () => {
        // get the selection from the clipboard
        this.selection = await navigator.clipboard.readText();
        this.modal.open();
      }
    });

    
    this.addSettingTab(new SmartPromptsSettingsTab(this.app, this));
    // register command to open the ChatGPT view
    this.addCommand({
      id: "sp-open-chatgpt",
      name: "Open Smart ChatGPT",
      callback: () => {
        this.app.workspace.getRightLeaf(false).setViewState({
          type: SMART_CHATGPT_VIEW_TYPE,
          active: true,
        });
        this.app.workspace.revealLeaf(
          this.app.workspace.getLeavesOfType(SMART_CHATGPT_VIEW_TYPE)[0]
        );
      }
    });

    // register command to toggle this.plugin.settings.auto_submit
    this.addCommand({
      id: "sp-toggle-auto-submit",
      name: "Toggle Auto-Submit",
      callback: () => {
        this.settings.auto_submit = !this.settings.auto_submit;
        this.save_settings();
        new Obsidian.Notice("Auto-Submit is now " + (this.settings.auto_submit ? "on" : "off"));
      }
    });

    this.addCommand({
      id: "sp-cancel-file-focus-prompt",
      name: "Cancel File Focus Prompt (when in progress)",
      hotkeys: [{ modifiers: ["Ctrl"], key: "q" }],
      callback: () => {
        this.clear_focus();
      }
    });
    
    // initialize when the layout is ready
    this.app.workspace.onLayoutReady(this.initialize.bind(this));
  }
  async initialize() {
    // load settings
    await this.loadSettings();
    // initiate smart prompts folder if this.settings.folder is smart prompts and it is not already created
    if(this.settings.folder == "smart prompts" && !(await this.app.vault.adapter.exists("smart prompts"))) {
      await this.initiate_template_folder();
      new Obsidian.Notice("Smart Prompts folder created.");
    }
    // register views
    this.registerView(SMART_CHATGPT_VIEW_TYPE, (leaf) => (new SmartChatGPTView(leaf, this)));
    // register file-open event to automatically run if the file is open and focused for more than 10 seconds
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      if(!this.settings.auto_prompt_on_file_focus) {
        return;
      }
      // skip if SMART_CHATGPT_VIEW_TYPE is not open
      if(this.app.workspace.getLeavesOfType(SMART_CHATGPT_VIEW_TYPE).length == 0) {
        console.log("Smart Prompts: File Focus Prompt skipped because Smart ChatGPT is not open.");
        return;
      }
      // if settings.file_focus_prompt is not set, do nothing
      if(!this.file_focus_prompt_template){
        if(this.settings.file_focus_prompt != "") {
          new Obsidian.Notice("Smart Prompts: File Focus Prompt Template not found.");
        }
        return;
      }
      // if the file matches pattern in the file_focus_exceptions list
      for(let i = 0; i < this.file_focus_exceptions.length; i++) {
        if(file.path.indexOf(this.file_focus_exceptions[i]) > -1) {
          if(this.countdown_interval) {
            this.clear_focus();
          }
          console.log("Smart Prompts: File Focus Prompt excluded for " + file.path);
          return;
        }
      }

      this.countdown_ct = 10;
      if(!this.countdown_interval) {
        this.countdown_interval = setInterval(this.focusCountdown.bind(this, file), 1000);
      }
    }));
    new Obsidian.Notice("Smart Prompts initialized.");
  }


  
  clear_focus() {
    clearInterval(this.countdown_interval);
    this.countdown_interval = null;
    this.status_bar.empty();
  }
  async focusCountdown(file) {
    // console.log(this.countdown_ct);
    if(this.status_bar == null){
      this.status_bar = this.addStatusBarItem();
    }
    // countdown in the status bar
    this.status_bar.empty();
    this.status_bar.createEl("span", {text: "Smart Prompts: File Focus Prompt in " + this.countdown_ct + " seconds"});
    this.countdown_ct--;
    // clear the status bar when the countdown is done
    if(this.countdown_ct < 0) {
      this.clear_focus();
      // get the contents of file
      this.selection = await this.app.vault.cachedRead(file);
      await this.build_prompt(this.file_focus_prompt_template);
    }
  }


  async initiate_template_folder() {
    await this.app.vault.adapter.mkdir("smart prompts");
    // initiate prompt for critiquing a note
    let critic_prompt = "Please critique the following NOTE:";
    critic_prompt += "\n---START NOTE---";
    critic_prompt += "\n# {{TITLE}}";
    critic_prompt += "\n{{CURRENT}}";
    critic_prompt += "\n---END NOTE---";
    critic_prompt += "\nBEGIN Critique:";
    await this.app.vault.adapter.write("smart prompts/critique.md", critic_prompt);
    // initiate prompt for generating an outline for a note
    let outline_prompt = "Here are some notes for a piece I'm working on. Can you help me reorganize them into an outline?";
    outline_prompt += "\n---START NOTE---";
    outline_prompt += "\n# {{TITLE}}";
    outline_prompt += "\n{{CURRENT}}";
    outline_prompt += "\n---END NOTE---";
    outline_prompt += "\nBEGIN Outline:";
    await this.app.vault.adapter.write("smart prompts/outline.md", outline_prompt);
    // initiate prompt for generating a summary for a note
    let summary_prompt = "Here are some notes for a piece I'm working on. Can you help me summarize them?";
    summary_prompt += "\n---START NOTE---";
    summary_prompt += "\n# {{TITLE}}";
    summary_prompt += "\n{{CURRENT}}";
    summary_prompt += "\n---END NOTE---";
    summary_prompt += "\nBEGIN Summary:";
    await this.app.vault.adapter.write("smart prompts/summary.md", summary_prompt);
  }


  async build_prompt(prompt_template) {
    console.log("prompt chosen", prompt_template);
    // get the template contents
    let smart_prompt = await this.app.vault.cachedRead(prompt_template);
    // if template contains a double bracket
    if(smart_prompt.indexOf("{{") > -1) {
      // if {{CURRENT}} is in the template (case-insensitive)
      if(smart_prompt.toLowerCase().indexOf("{{current}}") > -1) {
        // replace {{CURRENT}} (case-insensitive) with selection.trim()
        smart_prompt = smart_prompt.replace(/{{CURRENT}}/gi, this.selection);
      }
      // if {{TITLE}} or {{FILE_NAME}} is in the template (case-insensitive)
      if(smart_prompt.toLowerCase().indexOf("{{title}}") > -1 || smart_prompt.toLowerCase().indexOf("{{file_name}}") > -1) {
        // get the current note title
        let title = this.app.workspace.getActiveFile().basename;
        // replace {{TITLE}} (case-insensitive) with title
        smart_prompt = smart_prompt.replace(/{{TITLE}}/gi, title);
        // replace {{FILE_NAME}} (case-insensitive) with title
        smart_prompt = smart_prompt.replace(/{{FILE_NAME}}/gi, title);
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
    // if still contains a double bracket, remove them and the text between them
    if(smart_prompt.indexOf("{{") > -1) {
      smart_prompt = smart_prompt.replace(/{{(.*?)}}/g, "");
    }

    // open a markdown view if none is open to 'focus the editor'
    let temp_view = null;
    if (!this.app.workspace.getActiveViewOfType(Obsidian.MarkdownView)) {
      this.app.workspace.getLeaf(false).setViewState({
        type: Obsidian.MarkdownView,
        active: true
      });
    }else{
      // focus the editor
      this.app.workspace.getActiveViewOfType(Obsidian.MarkdownView).editor.focus();
    }
    
    // save the current clipboard
    let clipboard = await navigator.clipboard.readText();
    // copy to the clipboard
    await navigator.clipboard.writeText(smart_prompt);
    if(temp_view) {
      // close the temp view
      temp_view.close();
    }
    // clear the selection
    this.selection = null;

    /**
     * Smart ChatGPT
     * ---
     * If SmartChatGPTView is open, send the prompt to the view
     */
    const smartChatGPTView = this.app.workspace.getLeavesOfType(SMART_CHATGPT_VIEW_TYPE)[0];
    if (smartChatGPTView) {
      // focus the smartChatGPTView
      // this.app.workspace.setActiveLeaf(smartChatGPTView);
      console.log("sending prompt to SmartChatGPTView");
      await smartChatGPTView.view.paste_prompt();
      // restore the clipboard
      await navigator.clipboard.writeText(clipboard);
    }else{
      new Obsidian.Notice("Smart Prompt: Copied to clipboard");
    }
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
    if (!this.plugin.settings.folder) {
      return this.app.vault.getMarkdownFiles();
    }
    const folder = this.app.vault.getAbstractFileByPath(this.plugin.settings.folder);
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
    await this.plugin.build_prompt(prompt_template);
  }
  
  async awaitDataViewPage(filePath) {
    const dataview = this.app.plugins.getPlugin('dataview');
    while (dataview && (!dataview.api || !dataview.api.page(filePath))) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  getPropertyValue(property_name, file) {
    if (!file) {
      return null;
    }
    /**
     * Leverage Dataview variable parsing if available
     */
    const dataview = this.app.plugins.getPlugin('dataview');
    if(dataview){
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
      }
    }
    const cache = this.app.metadataCache.getFileCache(file);
    if(!cache.frontmatter)
        return null;

    return (cache.frontmatter[property_name] ? cache.frontmatter[property_name] : null);
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

    new Obsidian.Setting(this.containerEl).setName("Folder location").setDesc("Files in this folder will be available as Smart Prompts template pallete.").addText((cb) => {
      cb.setPlaceholder("smart prompts").setValue(this.plugin.settings.folder).onChange(async (new_folder) => {
        this.plugin.settings.folder = new_folder;
        await this.plugin.save_settings();
      });
    });
    // toggle auto_submit
    new Obsidian.Setting(this.containerEl).setName("Auto Submit").setDesc("Automatically submit the prompt if the ChatGPT window is open.").addToggle((cb) => {
      cb.setValue(this.plugin.settings.auto_submit).onChange(async (value) => {
        this.plugin.settings.auto_submit = value;
        await this.plugin.save_settings();
      });
    });

    // toggle intial_prompt_enabled
    new Obsidian.Setting(this.containerEl).setName("Initial Prompt").setDesc("Enter an initial prompt when opening ChatGPT (good for using it as a journal)").addToggle((cb) => {
      cb.setValue(this.plugin.settings.initial_prompt_enabled).onChange(async (value) => {
        this.plugin.settings.initial_prompt_enabled = value;
        await this.plugin.save_settings();
      });
    });

    // initial_prompt
    new Obsidian.Setting(this.containerEl).setName("Initial Prompt").setDesc("The initial prompt to enter when opening the ChatGPT window.").addTextArea((cb) => {
      cb.setPlaceholder("initial prompt").setValue(this.plugin.settings.initial_prompt).onChange(async (new_prompt) => {
        this.plugin.settings.initial_prompt = new_prompt;
        await this.plugin.save_settings();
      });
    });

    // file_focus_prompt
    new Obsidian.Setting(this.containerEl).setName("File Focus Prompt (file name in templates folder)").setDesc("The prompt to enter when a file is focused for 10 seconds or more.").addText((cb) => {
      cb.setPlaceholder("file focus prompt").setValue(this.plugin.settings.file_focus_prompt).onChange(async (new_prompt) => {
        this.plugin.settings.file_focus_prompt = new_prompt;
        await this.plugin.save_settings();
      });
    });

    // auto prompt on file focus
    new Obsidian.Setting(this.containerEl).setName("Auto Prompt on File Focus").setDesc("Automatically prompt when a file is focused for 10 seconds or more.").addToggle((cb) => {
      cb.setValue(this.plugin.settings.auto_prompt_on_file_focus).onChange(async (value) => {
        this.plugin.settings.auto_prompt_on_file_focus = value;
        await this.plugin.save_settings();
      });
    });
    // file focus exceptions (comma separated list of file path matchers)
    new Obsidian.Setting(this.containerEl).setName("File Focus Exceptions").setDesc("Comma separated list of file path matchers to exclude from auto prompting on file focus.").addTextArea((cb) => {
      cb.setPlaceholder("file focus exceptions").setValue(this.plugin.settings.file_focus_exceptions).onChange(async (new_exceptions) => {
        this.plugin.settings.file_focus_exceptions = new_exceptions;
        await this.plugin.save_settings();
      });
    });
    
  }
}


module.exports = SmartPromptsPlugin;


const SMART_CHATGPT_VIEW_TYPE = "smart_chatgpt";
class SmartChatGPTView extends Obsidian.ItemView {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  getViewType() {
    return SMART_CHATGPT_VIEW_TYPE;
  }
  getDisplayText() {
    return "Smart ChatGPT";
  }
  getIcon() {
    return "bot";
  }
  onload() {
    console.log("loading view");
    this.containerEl.empty();
    this.containerEl.appendChild(this.create());
  }

  create() {
    this.frame = document.createElement("webview");
    // this.frame = document.createElement("iframe");
    this.frame.setAttribute("allowpopups", "");
    this.frame.addEventListener("dom-ready", () => {
      if(this.plugin.settings.initial_prompt_enabled){
        this.frame.addEventListener("found-in-page", async (e) => {
          // wait for one second
          await new Promise(resolve => setTimeout(resolve, 1000));
          await this.frame.executeJavaScript(`document.querySelector("textarea").focus()`);
          await this.frame.executeJavaScript(`document.querySelector("textarea").value = "${this.plugin.settings.initial_prompt}"`);
          // enter
          await this.frame.executeJavaScript(`document.querySelector("textarea").dispatchEvent(new KeyboardEvent("keydown", {key: "Enter"}))`);
  
        });
        this.frame.findInPage("textarea");
      }
    });
    // add 100% height and width to the webview
    this.frame.style.width = "100%";
    this.frame.style.height = "100%";
    this.frame.setAttribute("src", "https://chat.openai.com/chat");
    return this.frame;
  }

  // function to execute javascript in the webview
  async paste_prompt() {
    // paste text from clipboard into textarea
    await this.frame.executeJavaScript(`document.querySelector("textarea").value = ""`);
    await this.frame.executeJavaScript(`document.querySelector("textarea").focus()`);
    await this.frame.executeJavaScript(`document.execCommand("paste")`);

    /**
     * TO ENTER/SUBMIT
     */
    if(this.plugin.settings.auto_submit){
      await this.frame.executeJavaScript(`document.querySelector("textarea").focus()`);
      await this.frame.executeJavaScript(`document.querySelector("textarea").dispatchEvent(new KeyboardEvent("keydown", {key: "Enter"}))`);
    }
  }
}