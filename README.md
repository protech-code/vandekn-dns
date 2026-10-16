# Vandekn DNS

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?logo=javascript&logoColor=222222)](https://developer.mozilla.org/docs/Web/JavaScript)
[![DNS over HTTPS](https://img.shields.io/badge/DNS-over_HTTPS-2F6FEB)](https://www.rfc-editor.org/rfc/rfc8484)

________________
## Language: 
1. Vietnamese: Here
2. English: [README-EN.md](README-EN.md)
________________

Vandekn DNS là DNS-over-HTTPS (DoH) resolver chạy trên Cloudflare Workers. Worker kiểm tra truy vấn DNS với blocklist, trả NXDOMAIN cho tên miền bị chặn và chuyển tiếp các truy vấn còn lại đến upstream DNS-over-HTTPS.

### Câu trúc thư mục
```text
vandekn-dns
|_ src
|  |_ worker.js        Main project

```

### Tính năng

- Hỗ trợ truy vấn DoH qua `GET /dns-query?dns=...` và `POST /dns-query`.
- Đối chiếu tên miền với blocklist đã tổng hợp và lưu trong Cloudflare KV.
- Tải blocklist và whitelist từ các nguồn cấu hình trong `src/worker.js`; whitelist được áp dụng để loại tên miền khỏi blocklist.
- Dùng bộ nhớ đệm trong Worker cho phản hồi GET và blocklist.
- Cập nhật danh sách tự động mỗi ngày theo cron `0 0 * * *`, hoặc kích hoạt thủ công qua `GET /update`.
- Gửi truy vấn tới Cloudflare DNS và Google DNS qua DoH.

### Yêu cầu

- Node.js và npm.
- Tài khoản Cloudflare cùng quyền triển khai Workers.
- Một Cloudflare KV namespace được gắn với binding `ADBLOCK_KV`.

### Cài đặt và chạy local

```bash
npm ci
npm run dev
```

Wrangler sẽ hiển thị địa chỉ local sau khi khởi động. Mở `/` để kiểm tra Worker đang hoạt động.

### Cấu hình KV

`wrangler.jsonc` khai báo KV binding tên `ADBLOCK_KV`. Hãy thay `id` bằng ID namespace KV của bạn và bảo đảm namespace đó tồn tại trong tài khoản Cloudflare được Wrangler sử dụng.

Worker đọc danh sách cho phép tùy chỉnh từ khóa `WHITELIST` trong KV. Khi cập nhật, Worker ghi blocklist đã tổng hợp vào khóa `MERGED_BLOCKLIST`.

### Triển khai

```bash
npm run deploy
```

Sau khi triển khai, cấu hình hostname hoặc route cho Worker trong Cloudflare theo nhu cầu. `workers_dev` đang tắt trong `wrangler.jsonc`, vì vậy cần cấu hình route/hostname để truy cập Worker.

### API

| Đường dẫn | Mô tả |
| --- | --- |
| `GET /` | Health check đơn giản; trả về `Vandekn DNS is ACTIVE!`. |
| `GET /dns-query` | Health check DoH dạng JSON khi không có tham số `dns`. |
| `GET /dns-query?dns=<base64url>` | Gửi truy vấn DNS mã hóa Base64URL. |
| `POST /dns-query` | Gửi truy vấn DNS trong request body. |
| `GET /update` | Khởi chạy cập nhật blocklist và whitelist ở background. |

Các request DoH trả về nội dung kiểu `application/dns-message`. Tên miền khớp blocklist được trả về với mã NXDOMAIN; các tên miền khác được chuyển tiếp tới upstream DNS.

### Nguồn danh sách

Các URL nguồn blocklist, whitelist và upstream DNS được khai báo trực tiếp trong `src/worker.js`. Điều chỉnh các mảng cấu hình tại đó để thay đổi nguồn sử dụng.

---


## License
this code license under Mit license in [LICENSE](License)