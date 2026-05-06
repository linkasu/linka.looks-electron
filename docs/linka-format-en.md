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
- **question** – quiz question for `quiz` pages.
- **cards** – list of cards on the page.

Cards may additionally contain:

- **answer** – marks the correct answer on `quiz` pages.
- **matchId** – pair identifier for `match` pages.
- **matchLane** – row placement (`top` or `bottom`) for `match` pages.

Legacy `2.0` files with a flat `cards` array are still supported and normalized into `pages` when loaded.
