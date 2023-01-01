# Smart Prompts
Smart Prompts is a plugin for Obsidian that allows you to generate prompts that include the context of the current note. If text from the current note is highlighted when the prompt is generated, the highlighted text will be included as the `{{current_note}}`. If no text is highlighted, the entire note will be included in the prompt as `{{current_note}}`.

## template folder
In the settings you can specify a folder in your vault to store your templates.

## variables replaced
The following variables are replaced in the prompt:
- `{{current|CURRENT}}` - the current note or the highlighted text
- Frontmatter variables - any frontmatter variables in the current note will be replaced with their values
- Dataview variables - inline variables using the dataview syntax may be used in the prompt

## TODO: Smart Context
- use AI to improve the context of the prompt
- include notes from outside of current note
  - embeddings
- make inferences about context