# MyTabs

Personal chord chart app. Remembers per-profile key, capo, and font size preferences for each song.

## Song format

In `songs.json`, each song's `content` is an array of strings:

- `[C]lyrics` - inline chord before the text it applies to
- `[Verse 1]` on its own line - section header (regex: `/^\[([A-Za-z0-9 ]+)\]$/`)
- `""` - blank line
- Songs sorted by `id` alphabetically
- For slash chords (`A/C#`), keep only the root (`A`)

## Data model

One object in localStorage (`mytabs:data`) and Firestore (`users/{uid}`):

```json
{
  "profiles": { "Name": { "song-id": { "transposeOffset": 0, "capoPosition": 0, "fontSize": 16 } } },
  "activeProfile": "Name",
  "stats": { "song-id": 3 }
}
```

## Sync

- Firebase is source of truth when signed in
- On auth: pull from Firestore into localStorage
- On change: write to both localStorage and Firestore
- No merge, no timestamps
