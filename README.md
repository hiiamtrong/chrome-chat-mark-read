# Mark read all - Google Chat

Extension Chrome (MV3) thêm nút **Mark all read** (tiếng Việt: **Đọc hết**) vào header list view của Google Chat. Bấm một lần để đánh dấu đã đọc mọi hội thoại chưa đọc của view đó, bấm lần nữa khi đang chạy để dừng.

## Cài

1. Mở `chrome://extensions`, bật **Developer mode**.
2. **Load unpacked** → chọn thư mục này.
3. Mở `https://chat.google.com`. Nút nằm trong hàng header của Home, ngay **sau viên thuốc `Thread`** và trước menu mật độ, cùng kiểu với các chip gốc của Chat. Chỉ view có chip `Unread`/`Thread` mới có nút (xem Giới hạn).

## Giao diện

Nút khớp chip gốc của Chat (đo trên app thật): cao 28px, bo tròn, nền tonal, Google Sans 12px/500, icon 18px. Nền và màu chữ được **lấy từ chip liền kề** nên đổi theo theme sáng/tối của Chat. Nhãn theo ngôn ngữ của Chat (`<html lang>`): tiếng Việt thì "Đọc hết", còn lại là tiếng Anh.

| Trạng thái | Icon | Nhãn (en) | Ghi chú |
|---|---|---|---|
| idle | ✓✓ | Mark all read | hover / nhấn đậm dần, focus ring khi dùng bàn phím |
| running | vòng xoay | Reading… 42 | `aria-busy`, bấm để dừng, vòng xoay tắt khi `prefers-reduced-motion` |
| done | ✓ | Read 206 | trang tự tải lại sau 1,5 giây nếu đã đọc bằng API |
| empty | ✓✓ nhạt | Nothing to read | view không còn hội thoại chưa đọc (không phải lỗi) |
| fail | ⓘ đỏ | Couldn't read | có row không chịu đọc được; tooltip: tải lại trang rồi thử lại |

Màu không phải tín hiệu duy nhất: mỗi trạng thái đổi cả icon lẫn chữ. Sau 3 giây nút trả về idle.

Chi tiết ở DevTools Console: `[gchat-markread] panel=... rows=... unread=... đã đọc=N (api=M) bỏ qua=... dừng vì <lý do>`. Khi `fail`, Console in thêm `debug panel:` / `debug row:` (HTML rút gọn) để chẩn đoán. Dừng vì `chạm MAX_ITER` thì bấm lại, backlog lớn cần nhiều lượt.

## Cơ chế

Extension chạy trong tab `chat.google.com` và ưu tiên **gọi thẳng endpoint nội bộ của web app**, giống hệt cái nút "Mark as read" trên từng row gọi:

- Lấy XSRF token: `POST /u/N/api/xsrf_token` với body `[]`.
- Mỗi topic: `POST /u/N/api/mark_topic_readstate?c=<số đếm>`, header `x-framework-xsrf-token` và `x-goog-chat-space-id`, body là mảng 100 phần tử: `[0] = [null, topicId, [[spaceId]]]`, `[1] = data-display-timestamp × 1000 + 999` (micro giây). Sau đó gọi thêm `set_topic_unread_timestamp` với `[0] = [null, topicId, [[spaceId]]]`, `[1] = 0` để xoá cờ chưa đọc (chấm xanh) của thread, vì mốc đọc không xoá cờ này.
- Gửi song song 4 topic mỗi lượt, cuộn list để Chat tải trang kế tiếp (50 topic/trang) và chờ tối đa 3 giây ở đáy trước khi kết luận hết.

Row không có `data-topic-id` (cấp group/space) hoặc topic API thất bại thì đánh dấu cả space: `POST /u/N/api/mark_group_readstate?c=<số đếm>`, cùng header, body 100 phần tử: `[0] = [[spaceId]]`, `[1] = data-display-timestamp × 1000 + 999` (micro giây). Payload bắt từ app thật.

Khi một row không dùng được API (không phải `space/...`, cả hai API đều lỗi hoặc không lấy được token) thì dự phòng bằng cách **mở hội thoại như người dùng**: dispatch chuỗi `pointerdown → mousedown → pointerup → mouseup → click`, vì Chat mở hội thoại ở `mousedown` và bỏ qua `element.click()`.

**Chọn list đúng view.** Chỉ nhận row nằm **dưới nút và cùng cột với nó**. Nhờ vậy sidebar (có mục mang badge số như Drafts) và panel Calendar không bao giờ bị nhầm là list của view; view trống thì báo `empty` chứ không leo lên bấm vào sidebar. Nút bị gỡ khỏi trang giữa chừng (đổi view) thì run dừng ngay.

Row nhận diện theo DOM thật: `span[role="listitem"]` có `data-topic-id`, `data-group-id`, `data-display-timestamp`, `data-is-unread="true"`, nằm trong `div[role="list"]`. Khi thiếu các thuộc tính này thì đoán theo `aria-label`, badge số, cuối cùng theo cấu trúc.

## Giới hạn cần biết

- **Endpoint nội bộ không có tài liệu.** Google đổi là API ngừng chạy, lúc đó extension tự rơi về click DOM (chậm hơn nhiều, và cần tab đang focus).
- **Chỉ Home có nút.** Mentions và Starred dùng row `div[role="link"]` không có `data-topic-id` lẫn cờ chưa đọc (chỉ có chip `@mention`), tức là một mô hình dữ liệu khác chưa được tìm hiểu, nên không có nút ở đó. Trước đây đường dự phòng từng chèn nhầm nút vào sidebar ở hai view này.
- **`mark_group_readstate` chỉ dùng cho `space/...`.** Đường group đọc cả space nên có thể đánh dấu luôn các topic khác trong space đó; body dùng `data-display-timestamp × 1000 + 999` như topic (trước đó dùng giờ máy thì space SotaTek Market không được đọc), chỉ kiểm `res.ok`, chưa biết chuỗi xác nhận; status và response được log ra Console.
- **Chấm xanh của row là cờ riêng.** `mark_group_readstate` chỉ ghi mốc đọc; bấm "Mark as read" trên row space chỉ gọi `set_mark_as_unread_timestamp` với `[0] = [[spaceId]]`, `[1] = 0`. Row space vì vậy gọi cả hai (SotaTek Market còn chấm xanh khi chỉ gọi cái đầu).
- **Space có thread chưa đọc.** Chấm xanh là cờ của từng thread, xoá bằng `set_topic_unread_timestamp` với `[0] = [null, "<id thread>", [[spaceId]]]`, `[1] = 0`. Id thread không nằm trong DOM của row, nên lấy từ `list_topics` (body 100 phần tử như app gửi, `[7] = [[spaceId]]`, `[8]`/`[9]` dùng giờ máy vì đổi giá trị vẫn ra cùng 32 thread). Response không có cờ chưa đọc để lọc, nên extension xoá cờ của mọi thread trả về (khoảng 30 request mỗi space). Thread đã đọc thì xoá cờ vô hại; nhãn `Đã đọc N` chỉ phản ánh request thành công, không phải số chấm xanh thật sự hết. Log `[gchat-markread] threads <space>: N thread, xoá cờ K` cho biết kết quả.
- **DM (`dm/...`) dùng `set_mark_as_unread_timestamp`** với body `[0] = [null, null, [id]]`, `[1] = 0` (payload bắt khi bấm "Mark as read" trên DM Google Drive). Id lấy từ phần sau `dm/` của `data-group-id`, chưa đối chiếu với DOM thật. DM mà API lỗi thì bị bỏ qua chứ không click, vì click mở hội thoại, Chat đổi view và run dừng giữa chừng.
- **Một số topic bị server giữ nguyên chưa đọc** dù trả 200 (gặp 1 topic cũ khi thử, kể cả gửi timestamp hiện tại). Nhãn `Read N` có thể đếm dư vài topic như vậy.
- **UI Chat không tự cập nhật** sau khi đọc bằng API (đã đo 60 giây), vì vậy trang tự tải lại. Nếu bạn đang soạn tin nhắn, nháp được Chat lưu trong mục Drafts.
- **Có thể lộ trạng thái đã xem** khi phải dự phòng bằng cách mở hội thoại. Đường API không mở hội thoại.
- Dùng `c=` tự đếm và body có 100 phần tử (`[99]` là header client có thể bỏ trống). Nếu đổi nữa, bắt lại request thật bằng DevTools (tab Network, lọc `mark_topic_readstate`) khi bấm "Mark as read" trên một row.
- Chỉ chạy trên `chat.google.com`, không hỗ trợ Chat trong Gmail, không chạy trong iframe. Chưa thử nhiều tài khoản (`/u/1`...): code lấy chỉ số từ URL nhưng chưa kiểm chứng.
- Màu nút lấy theo chip liền kề nên đúng với theme sáng đã thử; theme tối chưa kiểm tra bằng mắt.

## Test

Chạy `./test/run.sh` (Chrome headless, mỗi trang một profile riêng), hoặc mở từng file trong `test/` bằng Chrome.

- `fixture.html`, header dựng giống Chat thật (3 phần tử anh em: Unread, viên thuốc Thread, menu):
  - **Vị trí:** nút là anh em của hàng header, nằm ngay sau viên thuốc Thread và không nằm trong nó; lấy nền/chữ của chip liền kề; nhãn theo `lang`.
  - **Nhận diện:** `data-is-unread`, `aria-label`, badge, nhãn phủ định "Mark as unread", tên chứa chữ "mark".
  - **Chạy:** E2E đọc hết list thường và list dài có cuộn, row kẹt không chặn row khác, bấm lần hai để dừng, list ngắn không cuộn được (`overflow: clip`) vẫn kết thúc nhanh.
  - **API:** body đúng cấu trúc, header xsrf và space-id, mỗi topic đúng một lần, tải lại trang, dự phòng click DOM khi API trả 500, trang kế tiếp tải chậm, list chỉ còn 1 row.
  - **Kết quả:** `empty` (không phải lỗi) và `fail` (có dump DOM).
  - **An toàn:** sidebar không bao giờ có nút; view trống cạnh sidebar có badge không bị bấm nhầm; nút bị gỡ giữa chừng thì dừng.
- `structural.html`: dò theo cấu trúc khi Chat không đặt role.

Các test chạy trên DOM dựng sẵn với `fetch` giả. Việc gọi endpoint thật và hình dạng thật của header đã được kiểm chứng riêng bằng Playwright trên session Google thật, không nằm trong bộ test tự động.
