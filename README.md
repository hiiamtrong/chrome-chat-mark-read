[English](README.en.md) | Tiếng Việt

# Mark read all - Google Chat

Extension Chrome (Manifest V3) thêm nút **Mark all read** (tiếng Việt: **Đọc hết**) vào thanh tiêu đề của view Home trong Google Chat. Một lần bấm đánh dấu đã đọc mọi hội thoại chưa đọc trong danh sách, không cần mở từng hội thoại.

## Tính năng

- Đánh dấu đã đọc bằng các endpoint nội bộ mà chính Chat dùng, nên không mở hội thoại, không đổi view và không chuyển trang.
- Xoá cả mốc đọc lẫn cờ chưa đọc (chấm xanh) cho topic, space và DM.
- Hiển thị tiến độ trên nút. Bấm lần nữa khi đang chạy để dừng.
- Giao diện khớp với chip gốc của Chat, lấy màu từ chip liền kề. Nhãn theo ngôn ngữ của Chat (`<html lang>`).

## Yêu cầu

- Google Chrome hỗ trợ Manifest V3.
- Tài khoản có quyền dùng Google Chat tại `https://chat.google.com`.
- Chạy bộ test cần macOS và Google Chrome đặt ở `/Applications` (xem [Kiểm thử](#kiểm-thử)).

## Cài đặt

1. Mở `chrome://extensions` và bật **Developer mode**.
2. Chọn **Load unpacked**, rồi trỏ đến thư mục repo này.
3. Mở `https://chat.google.com`. Nút nằm trong hàng header của Home, ngay sau chip **Thread** và trước menu mật độ.

Chỉ view có chip **Unread** và **Thread** mới có nút (xem [Giới hạn](#giới-hạn)). Sau khi sửa code, reload extension ở `chrome://extensions` rồi tải lại tab Chat.

## Cách dùng

Bấm **Mark all read**. Nút đổi trạng thái theo tiến độ:

| Trạng thái | Icon | Nhãn (en / vi) | Ý nghĩa |
|---|---|---|---|
| idle | ✓✓ | Mark all read / Đọc hết | Sẵn sàng |
| running | vòng xoay | Reading… N / Đang đọc… N | Đang chạy, N là số hội thoại đã đọc. Bấm lần nữa để dừng |
| done | ✓ | Read N / Đã đọc N | Xong. Nếu đã đọc bằng API, trang tự tải lại sau 1,5 giây |
| empty | ✓✓ nhạt | Nothing to read / Không còn gì | View không còn hội thoại chưa đọc. Đây không phải lỗi |
| fail | ⓘ đỏ | Couldn't read / Không đọc được | Có row không đọc được. Tooltip gợi ý tải lại trang rồi thử lại |

Màu không phải tín hiệu duy nhất: mỗi trạng thái đổi cả icon lẫn chữ. Sau 3 giây, nút trở về idle.

Số N ở trạng thái `done` đếm request thành công, không phải số chấm xanh thật sự đã hết. Xem [Giới hạn](#giới-hạn).

### Log chẩn đoán

Mỗi lần chạy in một dòng vào Console (DevTools):

```text
[gchat-markread] panel=... rows=... unread=... đã đọc=N (api=M) bỏ qua=... dừng vì <lý do>
```

Khi kết thúc ở trạng thái `fail`, Console in thêm `debug panel:` và `debug row:` (HTML rút gọn). Nếu dừng vì `chạm MAX_ITER` (500 vòng), bấm lại để đọc tiếp. Backlog lớn cần nhiều lượt.

## Cách hoạt động

Extension chạy trong tab `chat.google.com` và gọi trực tiếp các endpoint mà nút "Mark as read" của chính Chat gọi. Các endpoint này không có tài liệu công khai.

### 1. Chọn đúng list

Extension chỉ nhận row nằm dưới nút và cùng cột với nó. Nhờ vậy sidebar (có mục mang badge số, như Drafts) và panel Calendar không bao giờ bị nhầm là list của view. View trống thì báo `empty`, không leo lên bấm vào sidebar. Nếu nút bị gỡ khỏi trang giữa chừng (đổi view), run dừng ngay.

Row được nhận diện qua `span[role="listitem"]` trong `div[role="list"]`, có các thuộc tính `data-topic-id`, `data-group-id`, `data-display-timestamp` và `data-is-unread="true"`. Khi thiếu thuộc tính, extension đoán theo `aria-label`, badge số, và cuối cùng theo cấu trúc DOM.

### 2. Đánh dấu qua API

Extension lấy XSRF token bằng `POST /u/N/api/xsrf_token` với body `[]`. Mỗi request gửi kèm header `x-framework-xsrf-token` và `x-goog-chat-space-id`. Body là mảng 100 phần tử, phần tử `[99]` là header client và có thể để trống.

`timestamp` trong bảng dưới là `data-display-timestamp` (mili giây), nhân 1000 rồi cộng 999 để ra micro giây.

| Loại row | Request | Body chính |
|---|---|---|
| Topic (`space/...` có `data-topic-id`) | `mark_topic_readstate` | `[0] = [null, topicId, [[spaceId]]]`, `[1] = timestamp` |
| Topic, sau khi đọc | `set_topic_unread_timestamp` | `[0] = [null, topicId, [[spaceId]]]`, `[1] = 0` |
| Space (không có topic) | `mark_group_readstate` | `[0] = [[spaceId]]`, `[1] = timestamp` |
| Space, xoá cờ | `set_mark_as_unread_timestamp` | `[0] = [[spaceId]]`, `[1] = 0` |
| Space, xoá cờ từng thread | `list_topics`, rồi `set_topic_unread_timestamp` cho từng thread | Xem bên dưới |
| DM (`dm/...`) | `set_mark_as_unread_timestamp` | `[0] = [null, null, [id]]`, `[1] = 0` |

Mốc đọc và chấm xanh là hai cờ độc lập. `mark_topic_readstate` và `mark_group_readstate` chỉ ghi mốc đọc. Chấm xanh cần một request xoá cờ riêng, nên mỗi row gọi cả hai.

Với space có thread chưa đọc, id thread không nằm trong DOM của row. Extension gọi `list_topics` cho space đó (`[7] = [[spaceId]]`, `[8]` và `[9]` là giờ máy) rồi lấy id thread từ response bằng regex. Response không có cờ chưa đọc để lọc, nên extension xoá cờ của mọi thread trả về, khoảng 30 request cho mỗi space. Xoá cờ của thread đã đọc không gây hại.

Các request chạy song song theo lượt 4 row. Sau mỗi lượt, extension cuộn list để Chat tải trang kế tiếp, và chờ tối đa 3 giây ở đáy trước khi kết luận đã hết.

### 3. Dự phòng

- **DM** mà API lỗi thì bị bỏ qua, không click. Click mở hội thoại, Chat đổi view và run dừng giữa chừng.
- **Row khác** (không nhận diện được, API lỗi, hoặc không lấy được token) thì mở hội thoại như người dùng. Extension gửi chuỗi `pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`, vì Chat mở hội thoại ở `mousedown` và bỏ qua `element.click()`.

## Giới hạn

- **Endpoint nội bộ không có tài liệu.** Nếu Google đổi endpoint, extension rơi về click DOM. Lúc đó chậm hơn nhiều và cần tab đang focus.
- **Chỉ view Home có nút.** Mentions và Starred dùng row `div[role="link"]` không có `data-topic-id` lẫn cờ chưa đọc, nên chưa có đường xử lý cho hai view này.
- **Số trên nút đếm request thành công.** Server đôi khi giữ nguyên trạng thái chưa đọc của một số topic dù trả 200 (đã gặp khi thử), nên N có thể đếm dư.
- **`mark_group_readstate` chỉ kiểm `res.ok`.** Chuỗi xác nhận của response chưa được xác định. Status và response được log ra Console.
- **Header của `list_topics` có hằng số** (`1795596034859439` và ngôn ngữ `en`) được sao chép từ request thật, chưa rõ vai trò. Nếu `list_topics` bắt đầu lỗi, hãy kiểm tra chỗ này trước.
- **Giao diện không tự cập nhật** sau khi đọc bằng API (đã đo trong 60 giây), nên extension tải lại trang. Nháp đang soạn được Chat lưu trong mục Drafts.
- **Dự phòng click DOM có thể lộ trạng thái đã xem**, vì nó mở hội thoại. Đường API không mở hội thoại.
- **Chưa kiểm chứng:** tài khoản thứ hai (`/u/1`, code lấy chỉ số từ URL), theme tối, và Chat chạy trong iframe hoặc Gmail. Extension không hỗ trợ Chat trong Gmail.

## Kiểm thử

```sh
sh test/run.sh
```

Script mở Chrome headless, mỗi trang dùng một profile tạm. Kết quả đúng là `<title>ALL PASS</title>` cho cả `fixture` và `structural`. Có thể mở từng file trong `test/` bằng Chrome để xem trực tiếp.

- `test/fixture.html` dựng header giống Chat thật (ba phần tử anh em: Unread, chip Thread, menu) và kiểm tra:
  - **Vị trí và kiểu:** nút nằm sau chip Thread, lấy nền và chữ từ chip liền kề, nhãn theo `lang`.
  - **Nhận diện row:** `data-is-unread`, `aria-label`, badge, nhãn phủ định "Mark as unread".
  - **Luồng chạy:** list thường, list dài có cuộn, row kẹt không chặn row khác, bấm lần hai để dừng, list ngắn không cuộn vẫn kết thúc nhanh.
  - **API:** body đúng cấu trúc, header xsrf và space id, mỗi topic được xử lý đúng một lần, tải lại trang, dự phòng khi API lỗi, trang kế tiếp tải chậm.
  - **Kết quả và an toàn:** trạng thái `empty` và `fail`, sidebar không bao giờ có nút, nút bị gỡ giữa chừng thì run dừng.
- `test/structural.html` dò row theo cấu trúc, dùng khi Chat không đặt role.

Bộ test chạy trên DOM dựng sẵn với `fetch` giả, không gọi server thật. Endpoint và hình dạng header thật được kiểm chứng riêng trên một phiên Google Chat đang đăng nhập.

## Khi Google đổi payload

1. Mở DevTools, tab **Network**, lọc theo tên endpoint (ví dụ `mark_topic_readstate` hoặc `set_topic_unread_timestamp`).
2. Bấm **Mark as read** trên một row, rồi so body với bảng ở [Cách hoạt động](#2-đánh-dấu-qua-api).
3. Cập nhật `content.js`, thêm hoặc sửa test trong `test/fixture.html`, chạy `sh test/run.sh`.
4. Tăng `version` trong `manifest.json` để xác nhận bản đã nạp.

`debug/probe.js` là script chỉ đọc DOM. Dán vào Console của tab `chat.google.com` để xem nút và chuỗi cha của nó khi cần chẩn đoán.

## Cấu trúc repo

```text
manifest.json       Khai báo extension (MV3), content script và CSS
content.js          Toàn bộ logic: nút, chọn list, gọi API, dự phòng click
styles.css          Kiểu của nút
test/fixture.html   Bộ test chính (DOM dựng sẵn, fetch giả)
test/structural.html Bộ test dò theo cấu trúc
test/run.sh         Chạy cả hai bộ test bằng Chrome headless
debug/probe.js      Script chẩn đoán DOM (chỉ đọc)
```
