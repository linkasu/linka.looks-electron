# `.linka` file format

Files with the `.linka` extension are regular ZIP archives. They store card sets used by the **Linka Looks** application.

## Archive contents

- **config.json** – main configuration file of the set. It describes the grid parameters and the list of cards.
- Image and audio files referenced by the cards. File names match the paths given in `config.json`.

## `config.json` structure

```json
{
  "version": "3.0",
  "withoutSpace": false,
  "directSet": false,
  "quizAutoNext": true,
  "quizReadQuestion": false,
  "pages": [
    {
      "id": "page-uuid",
      "mode": "standard",
      "columns": 3,
      "rows": 3,
      "cards": [
        {
          "id": "card-uuid",
          "cardType": 0,
          "width": 2,
          "imagePath": "...png",
          "title": "text",
          "audioPath": "...mp3",
          "audioText": "text",
          "audioVoice": "alena"
        }
      ]
    }
  ],
  "description": "description"
}
```

- **version** – format version.
- **withoutSpace** – whether cards have spacing between them.
- **directSet** – open the set directly in communication mode.
- **quizAutoNext** – automatically switch to the next question.
- **quizReadQuestion** – read the question aloud.
- **pages** – list of set pages.
- **description** – free description of the set.

Each page contains:

- **mode** – page mode: `standard`, `quiz`, or `match`.
- **columns** and **rows** – grid size for this specific page.
- **topColumns** and **bottomColumns** – optional independent top/bottom sizes for `match` pages; when absent, `columns` is used for both rows.
- **question** – quiz question for `quiz` pages.
- **cards** – list of cards on the page.

Cards may additionally contain:

- **width** and **height** – card size in grid cells. These fields are optional and default to `1`. Values greater than `1` are supported on `standard` and `quiz` pages; `match` pages always use `1×1` cards.
- **answer** – marks the correct answer on `quiz` pages.
- **matchId** – connection-group identifier for `match` pages; every top card and bottom card sharing an ID forms an intended connection.
- **matchLane** – row placement (`top` or `bottom`) for `match` pages.

When a card spans multiple cells, the covered positions in `cards` should be filled with empty cards (`cardType: 2`) so older app versions degrade safely. Older versions may ignore `width`/`height` and render those cards as regular `1×1` cards.

Legacy `2.0` files with a flat `cards` array are still supported and normalized into `pages` when loaded.
