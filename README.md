# Zeen

The app lives in [`app/`](app/). See [`app/README.md`](app/README.md) to run it. The product spec is [`Zeen.docx`](Zeen.docx).

## Design assets

The large design reference files (~180 MB) are not stored in git, to keep clones and pushes fast. They're attached to the [`design-assets` release](https://github.com/AcastaPaloma/zeen/releases/tag/design-assets):

| File | Size |
| --- | --- |
| `Collage.svg` | 99 MB |
| `Collagetool.svg` | 28 MB |
| `Cut and Fold.svg` | 9.6 MB |
| `Zeen brainstorm.png` | 43 MB |

To get them, run this from the repo root (needs the [GitHub CLI](https://cli.github.com)):

```sh
gh release download design-assets --repo AcastaPaloma/zeen --dir .
```

Or download them from the release page in a browser and put them in the repo root. They're already in `.gitignore`.

To add or update a file, upload it to the release instead of committing it, then add it to `.gitignore` and the table above:

```sh
gh release upload design-assets "New file.svg" --repo AcastaPaloma/zeen --clobber
```
