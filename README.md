English | [Tiếng Việt](README.vi.md)

# Mark read all - Google Chat

A Chrome extension (Manifest V3) that adds a **Mark all read** button (Vietnamese UI: **Đọc hết**) to the header of the Home view in Google Chat. One click marks every unread conversation in the list as read, without opening each conversation.

## Features

- Marks conversations as read through the same internal endpoints Chat uses itself, so it does not open conversations, change views, or navigate.
- Clears both the read marker and the unread flag (green dot) for topics, spaces, and DMs.
- Shows progress on the button. Click it again while it runs to stop.
- Matches Chat's own chips, taking colors from the adjacent chip. Labels follow Chat's language (`<html lang>`).

## Requirements

- Google Chrome with Manifest V3 support.
- A Google account that can use Google Chat at `https://chat.google.com`.
- Running the test suite needs macOS with Google Chrome installed in `/Applications` (see [Testing](#testing)).

## Installation

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this repository's folder.
3. Open `https://chat.google.com`. The button sits in the Home header, right after the **Thread** chip and before the density menu.

Only views with the **Unread** and **Thread** chips get the button (see [Limitations](#limitations)). After changing the code, reload the extension at `chrome://extensions` and then reload the Chat tab.

## Usage

Click **Mark all read**. The button changes state as it progresses:

| State | Icon | Label (en / vi) | Meaning |
|---|---|---|---|
| idle | ✓✓ | Mark all read / Đọc hết | Ready |
| running | spinner | Reading… N / Đang đọc… N | Running. N is the number of conversations read so far. Click again to stop |
| done | ✓ | Read N / Đã đọc N | Finished. If anything was read through the API, the page reloads after 1.5 seconds |
| empty | ✓✓ (muted) | Nothing to read / Không còn gì | The view has no unread conversations. This is not an error |
| fail | ⓘ red | Couldn't read / Không đọc được | Some row could not be read. The tooltip suggests reloading the page and trying again |

Color is not the only signal: each state changes both the icon and the text. After 3 seconds the button returns to idle.

The N in the `done` state counts successful requests, not the number of green dots actually cleared. See [Limitations](#limitations).

### Diagnostic log

Each run prints one line to the DevTools Console:

```text
[gchat-markread] panel=... rows=... unread=... đã đọc=N (api=M) bỏ qua=... dừng vì <lý do>
```

If a run ends in the `fail` state, the Console also prints `debug panel:` and `debug row:` (trimmed HTML). If a run stops because it hit `MAX_ITER` (500 iterations), click again to continue. A large backlog takes several runs.

## How it works

The extension runs in the `chat.google.com` tab and calls the same endpoints that Chat's own "Mark as read" button calls. These endpoints are not publicly documented.

### 1. Picking the right list

The extension only accepts rows that sit below the button and in the same column. This keeps the sidebar (which has count badges, such as Drafts) and the Calendar panel from being mistaken for the view's list. An empty view reports `empty` and never climbs up to click the sidebar. If the button is removed from the page mid-run (for example, after a view change), the run stops immediately.

Rows are recognized through `span[role="listitem"]` inside `div[role="list"]`, with the attributes `data-topic-id`, `data-group-id`, `data-display-timestamp`, and `data-is-unread="true"`. When an attribute is missing, the extension falls back to `aria-label`, then to count badges, and finally to the DOM structure.

### 2. Marking through the API

The extension gets an XSRF token with `POST /u/N/api/xsrf_token` and body `[]`. Each request sends the headers `x-framework-xsrf-token` and `x-goog-chat-space-id`. The body is a 100-element array. Element `[99]` is the client header and can be left empty.

In the table below, `timestamp` is `data-display-timestamp` (milliseconds), multiplied by 1000 and added to 999 to get microseconds.

| Row type | Request | Main body |
|---|---|---|
| Topic (`space/...` with `data-topic-id`) | `mark_topic_readstate` | `[0] = [null, topicId, [[spaceId]]]`, `[1] = timestamp` |
| Topic, after reading | `set_topic_unread_timestamp` | `[0] = [null, topicId, [[spaceId]]]`, `[1] = 0` |
| Space (no topic) | `mark_group_readstate` | `[0] = [[spaceId]]`, `[1] = timestamp` |
| Space, clear unread flag | `set_mark_as_unread_timestamp` | `[0] = [[spaceId]]`, `[1] = 0` |
| Space, clear unread flag of each thread | `list_topics`, then `set_topic_unread_timestamp` for each thread | See below |
| DM (`dm/...`) | `set_mark_as_unread_timestamp` | `[0] = [null, null, [id]]`, `[1] = 0` |

The read marker and the green dot are two independent flags. `mark_topic_readstate` and `mark_group_readstate` only write the read marker. The green dot needs a separate request that clears the unread flag, so each row sends both.

For a space with unread threads, the thread IDs are not in the row's DOM. The extension calls `list_topics` for that space (`[7] = [[spaceId]]`, `[8]` and `[9]` are the local clock) and extracts the thread IDs from the response with a regex. The response has no unread flag to filter on, so the extension clears the flag of every thread it returns, about 30 requests per space. Clearing the flag of an already-read thread does no harm.

Requests run in parallel batches of 4 rows. After each batch the extension scrolls the list so Chat loads the next page, and waits up to 3 seconds at the bottom before concluding that the list is finished.

### 3. Fallbacks

- **DMs** whose API call fails are skipped, not clicked. A click opens the conversation, Chat changes views, and the run stops partway.
- **Other rows** (not recognized, API failure, or no token) are opened like a user would open them. The extension sends `pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`, because Chat opens conversations on `mousedown` and ignores `element.click()`.

## Limitations

- **The internal endpoints are undocumented.** If Google changes an endpoint, the extension falls back to DOM clicks. That is much slower and needs the tab to stay focused.
- **Only the Home view has the button.** Mentions and Starred use `div[role="link"]` rows with no `data-topic-id` and no unread flag, so there is no handling for those views yet.
- **The number on the button counts successful requests.** The server sometimes keeps some topics unread even when it returns 200 (seen during testing), so N can overcount.
- **`mark_group_readstate` only checks `res.ok`.** The confirmation string in its response is not known. Status and response are logged to the Console.
- **The `list_topics` header has constants** (`1795596034859439` and language `en`) copied from a real request. Their role is not known. If `list_topics` starts failing, check this first.
- **The UI does not update on its own** after reading through the API (measured over 60 seconds), so the extension reloads the page. Drafts being composed are kept in the Drafts section.
- **The DOM-click fallback can reveal that you have seen a conversation,** because it opens it. The API path does not open conversations.
- **Not verified:** a second account (`/u/1`; the code reads the index from the URL), the dark theme, and Chat inside an iframe or Gmail. Chat inside Gmail is not supported.

## Testing

```sh
sh test/run.sh
```

The script opens Chrome headless, one temporary profile per page. The expected output is `<title>ALL PASS</title>` for both `fixture` and `structural`. You can also open each file in `test/` in Chrome to inspect it directly.

- `test/fixture.html` builds a header like the real Chat one (three sibling elements: Unread, the Thread chip, the menu) and checks:
  - **Position and style:** the button sits after the Thread chip, takes its background and text from the adjacent chip, and its label follows `lang`.
  - **Row recognition:** `data-is-unread`, `aria-label`, badges, and the negative label "Mark as unread".
  - **Run behavior:** a normal list, a long scrolling list, a stuck row that does not block other rows, a second click that stops the run, and a short non-scrolling list that still finishes quickly.
  - **API:** body structure, xsrf and space-id headers, each topic handled exactly once, page reload, fallback when the API fails, and a slow next page.
  - **Results and safety:** the `empty` and `fail` states, the sidebar never gets a button, and a run stops if the button is removed mid-run.
- `test/structural.html` finds rows by structure, for when Chat does not set roles.

The test suite runs against a hand-built DOM with a fake `fetch`. It does not call the real server. The real endpoints and header shapes were verified separately on a signed-in Google Chat session.

## When Google changes the payload

1. Open DevTools, go to the **Network** tab, and filter by endpoint name (for example `mark_topic_readstate` or `set_topic_unread_timestamp`).
2. Click **Mark as read** on a row, then compare the body with the table in [How it works](#2-marking-through-the-api).
3. Update `content.js`, add or change tests in `test/fixture.html`, and run `sh test/run.sh`.
4. Bump `version` in `manifest.json` so you can confirm the new build is loaded.

`debug/probe.js` is a read-only DOM inspection script. Paste it into the Console of a `chat.google.com` tab to see the button and its parent chain when diagnosing a problem.

## Repository layout

```text
manifest.json        Extension manifest (MV3), content script, and CSS
content.js           All logic: button, list selection, API calls, click fallback
styles.css           Button styles
test/fixture.html    Main test suite (hand-built DOM, fake fetch)
test/structural.html Structure-based test suite
test/run.sh          Runs both suites in Chrome headless
debug/probe.js       DOM diagnostic script (read-only)
```
