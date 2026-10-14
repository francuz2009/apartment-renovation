<?php
declare(strict_types=1);

// Email, на который будут приходить заявки (менеджер/отдел продаж)
define('MAIL_TO', 'newoutline@inbox.ru');

// Email отправителя (должен совпадать с доменом вашего сайта для прохождения SPF/DKIM)
define('MAIL_FROM', 'noreply@newoutline.ru');
define('MAIL_FROM_NAME', 'Сайт «Новый Контур»');

// Часовой пояс
date_default_timezone_set('Europe/Moscow');

// Режим отладки (в продакшене поставьте false)
define('DEBUG_MODE', false);

if (DEBUG_MODE) {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(0);
    ini_set('display_errors', '0');
}