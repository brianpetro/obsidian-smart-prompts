# Smart Prompts
Smart Prompts is an Obsidian plugin for prompt templates that is designed for interacting with language models like OpenAI's ChatGPT.

## ChatGPT integration
The plugin adds a ChatGPT window that can be opened from the command palette. Prompts will be automatically input into the ChatGPT window when it is open.

## template pallette
The plugin adds a command to the command palette to generate a prompt. The command palette will show a list of templates from the template folder. Selecting a template will copy the template to the clipboard and paste in into the ChatGPT window if it is open.

## template folder
In the settings you can specify a folder in your vault to store your templates. Defaults to `smart prompts` in the root of your vault. The name of the template file will be the name of the template in the command palette.

## variables replaced
The following variables are replaced in the prompt:
- `{{CURRENT}}` - If text from the current note is highlighted when the generating a prompt, the highlighted text will be used. If no text is highlighted, the entire note will be used.
- Frontmatter variables - Frontmatter variables can be used in the template using the bracket `{{NAME}}` syntax.
- Dataview variables - Inline variables can be used in the template if the dataview plugin is active.
- `{{Comining Soon}}`: Dynamic context using [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections/) plugin to source relevant context from outside of current note using AI.