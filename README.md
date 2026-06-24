# telegram-tool-workflow

Next.js app để quét một Telegram bot và gom các group + topic mà bot đã thấy trong
queue update.

## Chạy local

```bash
npm install
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

## Cách dùng

1. Dán bot token vào form.
2. Bấm `Quét bot`.
3. Xem danh sách group, topic và các cảnh báo webhook.
4. Dùng nút `Download CSV` để xuất dữ liệu.

## Lưu ý quan trọng

- Telegram Bot API không có endpoint “liệt kê tất cả group/topic” theo kiểu trực tiếp.
- Tool này đọc `getMe`, `getWebhookInfo` và `getUpdates`, rồi gom dữ liệu từ những
  update bot đã nhận.
- Nếu bot chưa từng nhận message trong một group/topic, mục đó sẽ không xuất hiện.
- Nếu webhook đang bật, bạn có thể cần tắt webhook để quét đầy đủ hơn.

## Cấu trúc chính

- `src/app/page.tsx` - UI chính
- `src/app/api/scan/route.ts` - route server gọi Telegram Bot API
- `src/lib/telegram.ts` - logic quét và gom group/topic
