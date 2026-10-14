<?php
// api/send-lead.php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

// --- Утилиты ---
function jsonResponse(array $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function generateCsrfToken(): string {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function verifyCsrfToken(string $token): bool {
    if (session_status() === PHP_SESSION_NONE) session_start();
    return isset($_SESSION['csrf_token']) && hash_equals($_SESSION['csrf_token'], $token);
}

function rateLimitCheck(string $ip, int $maxAttempts = 5, int $windowSec = 600): bool {
    $dir = __DIR__ . '/.rate';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $file = $dir . '/' . md5($ip) . '.json';
    $now = time();
    $data = ['attempts' => [], 'blocked_until' => 0];

    if (is_file($file)) {
        $raw = @file_get_contents($file);
        if ($raw) $data = array_merge($data, json_decode($raw, true) ?: []);
    }

    if (!empty($data['blocked_until']) && $data['blocked_until'] > $now) return false;

    $data['attempts'] = array_values(array_filter($data['attempts'] ?? [], fn($t) => $t > ($now - $windowSec)));
    if (count($data['attempts']) >= $maxAttempts) {
        $data['blocked_until'] = $now + $windowSec;
        @file_put_contents($file, json_encode($data), LOCK_EX);
        return false;
    }

    $data['attempts'][] = $now;
    @file_put_contents($file, json_encode($data), LOCK_EX);
    return true;
}

function cleanString(?string $value, int $maxLen = 255): string {
    if ($value === null) return '';
    $value = trim(strip_tags($value));
    $value = preg_replace('/[\x00-\x1F\x7F]/u', '', $value) ?? '';
    return mb_substr($value, 0, $maxLen);
}

function normalizePhone(string $phone): string {
    $digits = preg_replace('/\D+/', '', $phone) ?? '';
    if (strlen($digits) === 11 && $digits[0] === '8') $digits = '7' . substr($digits, 1);
    return (strlen($digits) === 11 && $digits[0] === '7') ? '+' . $digits : '';
}

function sendMail(string $to, string $subject, string $htmlBody, string $textBody): bool {
    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'From: =?UTF-8?B?' . base64_encode(MAIL_FROM_NAME) . '?= <' . MAIL_FROM . '>',
        'X-Mailer: NewOutlineLead/1.0'
    ];
    $subjectEncoded = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    return @mail($to, $subjectEncoded, $htmlBody, implode("\r\n", $headers));
}

// --- 1. Выдача CSRF-токена (GET) ---
if (isset($_GET['action']) && $_GET['action'] === 'token') {
    jsonResponse(['ok' => true, 'token' => generateCsrfToken()]);
}

// --- 2. Обработка заявки (POST) ---
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['ok' => false, 'error' => 'Метод не разрешён'], 405);
}

$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if (!rateLimitCheck($ip)) {
    jsonResponse(['ok' => false, 'error' => 'Слишком много попыток. Попробуйте позже.'], 429);
}

$csrf = $_POST['csrf_token'] ?? '';
if (!is_string($csrf) || !verifyCsrfToken($csrf)) {
    jsonResponse(['ok' => false, 'error' => 'Ошибка безопасности. Обновите страницу.'], 403);
}

// Honeypot (защита от ботов)
if (!empty($_POST['website'] ?? '')) {
    jsonResponse(['ok' => true, 'message' => 'Заявка принята']); // Молча игнорируем бота
}

// Валидация
$nameRaw  = cleanString($_POST['name'] ?? '', 60);
$phoneRaw = cleanString($_POST['phone'] ?? '', 30);
$phone    = normalizePhone($phoneRaw);
$consent  = !empty($_POST['consent']);

$errors = [];
if (mb_strlen($nameRaw) < 2) $errors['name'] = 'Укажите имя (минимум 2 символа)';
if ($phone === '') $errors['phone'] = 'Введите корректный номер телефона';
if (!$consent) $errors['consent'] = 'Необходимо согласие на обработку данных';

if (!empty($errors)) {
    jsonResponse(['ok' => false, 'errors' => $errors], 422);
}

// Данные калькулятора
$calcType      = cleanString($_POST['calc_type'] ?? '', 40);
$calcArea      = (int)($_POST['calc_area'] ?? 0);
$calcTotal     = (int)($_POST['calc_total'] ?? 0);
$calcBase      = (int)($_POST['calc_base'] ?? 0);
$calcExtra     = (int)($_POST['calc_extra'] ?? 0);
$calcExtrasRaw = cleanString($_POST['calc_extras_list'] ?? '', 500);
$sourcePage    = cleanString($_POST['source_page'] ?? '', 255);

$allowedTypes = ['Косметический', 'Капитальный', 'Дизайнерский'];
if (!in_array($calcType, $allowedTypes, true)) $calcType = 'Не указан';
if ($calcArea < 20 || $calcArea > 200) $calcArea = 0;

// Формирование письма
$dateHuman = date('d.m.Y H:i');
$extrasFormatted = $calcExtrasRaw !== '' ? $calcExtrasRaw : 'нет';

$subject = 'Новая заявка с сайта — ' . $nameRaw . ' (' . $phone . ')';

$htmlBody = <<<HTML
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.6;background:#f4f4f4;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e9e6">
    <div style="background:#b5cbb8;padding:24px;color:#111">
      <h1 style="margin:0;font-size:22px;font-weight:900;text-transform:uppercase">Новая заявка</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:.7">Сайт «Новый Контур» · {$dateHuman}</p>
    </div>
    <div style="padding:24px">
      <h2 style="margin:0 0 16px;font-size:14px;text-transform:uppercase;letter-spacing:.1em;color:#6b7a6f">Контактные данные</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#6b7a6f;width:40%">Имя:</td><td style="padding:8px 0;font-weight:700">{$nameRaw}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7a6f">Телефон:</td><td style="padding:8px 0;font-weight:700"><a href="tel:{$phone}" style="color:#111;text-decoration:none">{$phone}</a></td></tr>
      </table>

      <h2 style="margin:24px 0 16px;font-size:14px;text-transform:uppercase;letter-spacing:.1em;color:#6b7a6f">Расчёт из калькулятора</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#6b7a6f;width:40%">Тип ремонта:</td><td style="padding:8px 0;font-weight:700">{$calcType}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7a6f">Площадь:</td><td style="padding:8px 0;font-weight:700">{$calcArea} м²</td></tr>
        <tr><td style="padding:8px 0;color:#6b7a6f">Базовая стоимость:</td><td style="padding:8px 0;font-weight:700">{$calcBase} ₽</td></tr>
        <tr><td style="padding:8px 0;color:#6b7a6f">Доп. опции:</td><td style="padding:8px 0;font-weight:700">{$calcExtra} ₽</td></tr>
        <tr><td style="padding:8px 0;color:#6b7a6f">Список доп. опций:</td><td style="padding:8px 0;font-weight:700">{$extrasFormatted}</td></tr>
        <tr><td colspan="2" style="padding:12px 0;border-top:1px dashed #ccc"></td></tr>
        <tr><td style="padding:8px 0;color:#6b7a6f;font-size:16px">ИТОГО:</td><td style="padding:8px 0;font-weight:900;font-size:20px;color:#8fab95">{$calcTotal} ₽</td></tr>
      </table>

      <p style="margin:24px 0 0;font-size:12px;color:#999">
        Источник: {$sourcePage}<br>IP: {$ip}
      </p>
    </div>
  </div>
</body>
</html>
HTML;

$textBody = "НОВАЯ ЗАЯВКА — Новый Контур\nВремя: {$dateHuman}\n\n"
          . "Имя: {$nameRaw}\nТелефон: {$phone}\n\n"
          . "РАСЧЁТ КАЛЬКУЛЯТОРА\n"
          . "Тип: {$calcType}\nПлощадь: {$calcArea} м²\n"
          . "База: {$calcBase} ₽ | Допы: {$calcExtra} ₽\n"
          . "Доп. опции: {$extrasFormatted}\nИТОГО: {$calcTotal} ₽\n\n"
          . "Источник: {$sourcePage}\nIP: {$ip}";

// Отправка и логирование
$sent = sendMail(MAIL_TO, $subject, $htmlBody, $textBody);

$logLine = sprintf(
    "[%s] %s | %s | %s | %d м² | %d ₽ | %s\n",
    date('c'), $phone, $nameRaw, $calcType, $calcArea, $calcTotal, $sent ? 'OK' : 'FAIL'
);
@file_put_contents(__DIR__ . '/leads.log', $logLine, FILE_APPEND | LOCK_EX);

jsonResponse([
    'ok' => true,
    'message' => 'Спасибо! Перезвоним в течение 15 минут.'
]);