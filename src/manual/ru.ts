export const RU_MANUAL = `
# anyIP CLI — Руководство пользователя

## Обзор

anyIP.io предоставляет резидентные и мобильные прокси для парсинга веб-сайтов,
автоматизации и сбора данных. Этот CLI позволяет управлять аккаунтами прокси,
мониторить трафик, создавать сессии и генерировать целые конфигурации прокси
с помощью обычного текста — прямо из терминала.

Официальная документация: https://anyip.io/docs/guides/quick-start

---

## Установка

### Глобальная установка (рекомендуется)
    npm install -g anyip-cli
    anyip --help

### Из исходного кода
    git clone <репозиторий>
    cd anyip-cli
    npm install
    npm run build
    npm link

### Без установки (разовое использование)
    npx anyip-cli <команда>

---

## Первоначальная настройка

### Вариант A — Интерактивный ввод (ключи не попадают в историю shell)
    anyip config set-keys

### Вариант B — Через флаги
    anyip config set-keys --anyip ВАШ_КЛЮЧ_ANYIP --claude ВАШ_КЛЮЧ_CLAUDE

### Вариант C — Переменные окружения (для CI/CD)
    export ANYIP_API_KEY=ваш_ключ_anyip
    export ANTHROPIC_API_KEY=ваш_ключ_claude

Переменные окружения имеют приоритет над сохранённой конфигурацией.
Ключ Claude необязателен — нужен только для \`anyip generate\` и \`anyip man\` (не на английском).

### Просмотр конфигурации
    anyip config show          # показывает замаскированные ключи и путь к файлу конфигурации

### Очистка конфигурации
    anyip config clear

---

## Управление аккаунтами

    anyip account              # список всех аккаунтов прокси (таблица)
    anyip account me           # информация об аккаунте anyIP и квота
    anyip account list         # то же самое
    anyip account list --json  # вывод в формате JSON
    anyip account inspect <id>            # детальная информация об аккаунте
    anyip account inspect <id> --json     # вывод в JSON
    anyip account create -d "Мой прокси" --type residential --country US
    anyip account enable <id>
    anyip account disable <id>
    anyip account bulk-reset              # сброс квот всех аккаунтов (требует подтверждения)
    anyip account bulk-reset --yes        # без подтверждения (для скриптов)

### Параметры создания аккаунта
    -d, --description <текст>  Обязательно. Описание аккаунта
    --type <тип>               residential | mobile
    --country <код>            Код страны ISO: US, FR, DE, TH и т.д.
    --region <имя>             Регион/штат (строчными буквами): california
    --city <имя>               Город (строчными буквами): paris
    --session <имя>            Имя липкой сессии (буквы, цифры, подчёркивание)
    --sess-time <минуты>       Длительность сессии 1–10080 (по умолчанию: 7 дней)
    --quota <байты>            Лимит трафика (по умолчанию: 1 ГБ = 1073741824)
    --password <пароль>        Свой пароль (если не указать — генерируется автоматически)

---

## Управление сессиями

Сессии — это локально сохранённые конфигурации прокси-подключений. Команда \`get\`
находит или создаёт сессию и проверяет её через реальный curl-запрос.

### Найти / создать / протестировать сессию
    anyip get                                    # первый аккаунт, мобильный, SOCKS5
    anyip get --residential --location US        # резидентный прокси в США
    anyip get --mobile --location FR             # мобильный прокси во Франции
    anyip get --residential --rotating           # ротационный IP (новый IP на каждый запрос)
    anyip get --residential --time 30            # липкая сессия на 30 минут
    anyip get --user 2                           # использовать аккаунт #2
    anyip get --list                             # только показать совпадения, без curl

### Управление сохранёнными сессиями
    anyip proxy list                  # аккаунт, сеть, тип, сессия, conn, локация
    anyip proxy list --network mobile # residential | mobile
    anyip proxy list --session sticky # sticky | rotating
    anyip proxy list --search paris   # имя, страна, регион, город, pool, ASN или тег
    anyip proxy list --format http    # hostuser | userhost | http | https | socks5
    anyip proxy list --user 1         # сессии аккаунта #1
    anyip proxy get <имя>            # детальная карточка сессии
    anyip proxy curl <имя>           # вывести curl-команду для теста
    anyip proxy curl <имя> --run     # выполнить curl-тест
    anyip proxy add сервер:порт:логин:пароль   # импорт из строки подключения
    anyip proxy import proxies.txt    # массовый импорт (по одной строке на строку файла)
    anyip proxy delete <имя>         # удалить сессию
    anyip proxy clear                 # удалить все сессии (требует подтверждения)

---

## Мониторинг трафика

    anyip traffic list                            # отправлено/получено по дням (последние 30 дней)
    anyip traffic list --interval hourly          # почасовая детализация
    anyip traffic usage                           # квота команды: использовано / осталось
    anyip traffic list --from 2024-01-01          # с указанной даты
    anyip traffic list --to 2024-01-31            # по указанную дату
    anyip traffic list --proxy <id>               # фильтр по аккаунту прокси
    anyip traffic list --json                     # вывод в JSON
    anyip traffic export                          # экспорт CSV в stdout
    anyip traffic export -o traffic.csv           # сохранить в файл

---

## Географические данные

    anyip country                      # список доступных стран
    anyip country --json
    anyip region US                    # регионы/штаты для США
    anyip city US california           # города региона (название или слаг)
    anyip city US                      # все города страны, по регионам
    anyip city US --tags               # country_US,region_texas,city_dallas (теги username)
    anyip asn US                       # ASN провайдеров для США
    anyip near "Eiffel Tower"          # GPS-координаты места
    anyip near Paris --country US -n 3 # только совпадения в США
    anyip near paris --tags            # lat_48.85341,lon_2.3488

Используйте эти команды для получения допустимых значений --country и --region.

--tags (псевдоним --flag) работает для country, region, city, asn и near: вместо
списка печатаются теги username, по одному на строку. Код страны идёт первым,
потому что region_/city_ игнорируются без country_.

---

## Быстрый тест прокси

    anyip check 1     # проверить аккаунт #1 (получить IP через ip-api.com)

---

## AI-генератор прокси

Опишите задачу обычным текстом. Claude проанализирует и автоматически создаст
оптимальный набор прокси-аккаунтов.

    # Описание в командной строке
    anyip generate "парсинг цен Amazon в 5 городах США, ротационные IP"

    # Интерактивный ввод (без аргументов)
    anyip generate

    # Предпросмотр плана без создания аккаунтов
    anyip generate "10 аккаунтов Instagram во Франции, липкие сессии" --dry-run

    # Сохранить список учётных данных в файл
    anyip generate "резидентные прокси США для SEO" --output proxies.txt

Вы получаете рекомендуемую конфигурацию и 2-3 альтернативы (экономный пул, липкие
сессии для входа в аккаунты, мобильный/ASN-резерв…), каждая с таблицей: какой флаг
username используется и зачем он нужен именно вашей задаче.

После генерации все сессии автоматически сохраняются локально.
Используйте \`anyip proxy list\` для просмотра.

---

## Веб-интерфейс

Запустите локальный браузерный интерфейс для визуального управления:

    anyip serve               # открывает http://127.0.0.1:3000
    anyip dashboard           # та же команда — алиасы: dashboard, dash, gui
    anyip serve --port 8080   # другой порт

Нажмите Ctrl+C для остановки. Интерфейс включает:
- Список аккаунтов с переключателями включения/отключения
- Форму AI-генератора
- Обзор трафика
- Просмотр сессий
- Кнопка смены IP в каждой sticky-сессии (ссылка ротации)
- Настройки (шестерёнка рядом с + New Proxy): API-ключи и цвета

---

## Просмотр руководства

    anyip man                  # английское руководство
    anyip manual french        # та же команда — алиасы: manual, docs
    anyip docs es              # язык словом или кодом
    anyip man --language zh    # китайское (中文)
    anyip man --language ru    # русское (данный документ)

---

## Формат URL прокси

    http://логин:пароль@gate.anyip.io:8080         (HTTP)
    https://логин:пароль@portal.anyip.io:443        (HTTPS)
    socks5://логин:пароль@portal.anyip.io:1080      (SOCKS5)

Все три протокола работают на одном хосте — выбирайте тот, который поддерживает клиент.

Атрибуты передаются внутри имени пользователя (через запятую):
    http://user_ID,type_residential,country_US,session_имя:пароль@gate.anyip.io:8080

Атрибуты:
    user_XXXX       идентификатор аккаунта
    type_XXX        residential | mobile
    country_XX      код страны ISO
    region_XXX      регион (slug)
    city_XXX        город (slug)
    asn_N           закрепить провайдера (см. anyip asn)
    lat_X,lon_Y     ближайший пир к GPS-точке (см. anyip near)
    session_NAME    имя сессии (без него — ротационный режим)
    sesstime_N      длительность сессии в минутах

---

## Переменные окружения

    ANYIP_API_KEY        API-ключ anyIP.io (приоритет над локальной конфигурацией)
    ANTHROPIC_API_KEY    API-ключ Claude (приоритет над локальной конфигурацией)
    NO_COLOR             отключить цветной вывод (любое значение)

---

## Советы

- Добавьте \`--json\` к любой команде данных для пайпинга: \`anyip account list --json | jq '.[].username'\`
- \`anyip get\` запоминает сессии — создайте один раз, используйте многократно
- Для парсинга: используйте \`--rotating\` (новый IP на каждый запрос)
- Для управления аккаунтами: используйте \`--session имя\` (фиксированный IP)
- Для CI/CD: задайте \`ANYIP_API_KEY\` как секрет, не нужен \`anyip config set-keys\`
- Перевод квот: 1 ГБ = 1073741824 байт, 5 ГБ = 5368709120 байт
`;
