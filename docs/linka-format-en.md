# `.linka` file format

Files with the `.linka` extension are regular ZIP archives. They store card sets used by the **Linka Looks** application.

## Archive contents

- **config.json** – main configuration file of the set. It describes the grid parameters and the list of cards.
- Image and audio files referenced by the cards. File names match the paths given in `config.json`.

## `config.json` structure

```json
{
  "version": "2.0",
  "columns": 3,
  "rows": 3,
  "withoutSpace": false,
  "directSet": false,
  "quiz": false,
  "questions": [],
  "quizAutoNext": true,
  "quizReadQuestion": false,
  "cards": [
    {
      "id": "uuid",
      "cardType": 0,
      "imagePath": "...png",
      "title": "text",
      "audioPath": "...mp3",
      "audioText": "text",
      "audioVoice": "alena",
      "answer": true
    }
  ],
  "description": "description"
}
```

- **version** – format version.
- **columns** and **rows** – grid size of cards.
- **withoutSpace** – whether cards have spacing between them.
- **directSet** – open the set directly in communication mode.
- **quiz** – quiz mode flag.
- **questions** – array of quiz questions.
- **quizAutoNext** – automatically switch to the next question.
- **quizReadQuestion** – read the question aloud.
- **cards** – list of cards in the set.
- **description** – free description of the set.

Each card entry contains its identifier, type and references to resources inside the archive.
