# Project instructions

These instructions apply throughout the repository.

## Share visual work in Excalidraw

- Share UI layouts, components, design alternatives and diagrams as editable
  `.excalidraw` files in the repository.
- Update an existing relevant design file when possible. Otherwise, add a
  descriptively named file alongside the existing root-level Excalidraw files.
- Label alternatives and important interaction states so reviewers can compare
  them. Keep the selected design consistent with the implemented UI.
- Link the Excalidraw file when presenting visual work. Screenshots and image
  exports may supplement it, but do not replace the editable source.
- Include the exact filename, with its `.excalidraw` extension, in the visible
  link text or alongside every Excalidraw link so the file is easy to find.

## Keep Git history linear

- Prefer rebase when integrating work. Fetch the latest target branch and rebase
  feature commits onto it before landing.
- Integrate with a fast-forward-only merge, such as `git merge --ff-only <branch>`,
  or use "Rebase and merge" for a pull request. Do not create merge commits or use
  `--no-ff`.
- After rebasing, resolve conflicts and rerun the checks relevant to the change
  before landing it.
- Do not rebase shared `main` history. Get explicit permission before rewriting
  published history or force-pushing; preferring rebase does not grant permission
  to do either.
- Get explicit authorization before merging into or pushing to `main`.
