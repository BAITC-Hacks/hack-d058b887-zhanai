# RU

# **Хакатон-задача: умный подбор подрядчиков (\#79-lite)**

---

## **Легенда**

Вы работаете на площадке-агрегаторе event-подрядчиков в Казахстане. Заказчик уже выбрал тип мероприятия и получил каталог по своему городу. Ваша задача — помочь ему выбрать из этого списка, а не удлинить список.

## **Задача**

Сервис принимает параметры заказа и возвращает до 3 карточек подрядчиков, у каждой — объяснение, почему этот подрядчик здесь. Ценность в объяснении, а не в сортировке.

## **Данные**

hackathon-dataset-anonymized.jsonl — 66 профилей (есть также .csv и HTML-превью).

| поле | что это |
| :---- | :---- |
| id, anon\_name | идентификатор и имя (имена вымышленные) |
| categories | список категорий подрядчика |
| city | Алматы / Астана / Зарубежье |
| price\_from\_kzt | цена «от», ₸ за мероприятие |
| event\_formats | форматы, которые подрядчик берёт: свадьба, той, корпоратив, конференция, юбилей, день рождения |
| languages | языки работы: русский, казахский, английский |
| max\_hours | максимум часов на площадке; null — работа не привязана к присутствию (флорист, декоратор, сувениры) |
| busy\_dates | занятые даты в окне 23.09.2026 — 31.12.2026 (100 дней). У площадок такой же календарь, как у людей |
| description | свободный текст на русском |
| synthetic, city\_imputed, price\_imputed | флаги: 13 профилей полностью синтетические, часть городов и цен проставлена при подготовке датасета |

Данные анонимизированы, дополнительной обработки на этот счёт не требуют.

Загрузка календарей: сентябрь-ноябрь — 30-50% дней заняты, декабрь — 70-80%. В декабре в плотных категориях на выходные почти никого не остаётся: это не баг датасета, а сезон.

Записей мало — можно дописать своих синтетических профилей в том же формате, пометив их synthetic: true. В демо должно быть видно, где настоящий профиль, а где ваш.

## **Требования**

> > 1\.        **Вход:** город, дата мероприятия, тип мероприятия, категория подрядчика, бюджет (₸). Опционально — длительность (ч) и язык.

> > 2\.        **Выход:** до 3 карточек. В карточке — имя, категория, город, цена и 1–2 предложения объяснения: совпадение по бюджету, формату, языку, длительности или по смыслу описания. Общих фраз вроде «отличный выбор для вашего мероприятия» быть не должно.

> > 3\.        Подрядчик, занятый на эту дату, в выдачу не попадает. Площадки лежат в том же каталоге и с тем же календарём: «подобрать зал на 14 ноября» — это такой же запрос, только категория другая.

> > 4\.        Подходящих меньше трёх — показать сколько есть и сказать, почему меньше.

> > 5\.        **Детерминизм:** тот же запрос — тот же порядок карточек.

> > 6\.        Три исхода различимы для пользователя явно: подобрали / в этом городе такой категории нет / кандидаты есть, но ни один не проходит по условиям (заняты на дату, не тянут бюджет, не берут этот формат).

## **Что не входит**

> > •           Бронирование, заявки, уведомления подрядчику — только рекомендация.

> > •           Красивый UI. Если выбирать между интерфейсом и качеством объяснений — берите объяснения.

> > •           Дообучение модели на 66 записях: за день это даёт пересказ датасета. Готовые эмбеддинги и LLM через API — пожалуйста.

## **Definition of Done**

Проверяется вживую, не на слайде.

> > •           Ответ на запрос приходит за разумное время (ориентир — до 10 секунд).

> > •           Объяснения не взаимозаменяемы: если стереть имена, карточки одного запроса нельзя перепутать между собой.

> > •           Повторный запуск с теми же параметрами даёт тот же порядок.

> > •           Один и тот же запрос на две разные даты даёт разную выдачу, и в объяснении видно, что дело в занятости.

> > •           Показаны минимум три запроса:

–          плотная категория на осеннюю дату, где ранжирование реально работает (Ведущий — 15 профилей, Фотограф — 12, Банкетный зал — 8);

–          редкая категория (Флорист, Декоратор, Подарки и сувениры, Ведущий церемонии, Фото и видеобудки, Отель, Инструменталист — по 3 профиля);

–          запрос без результата.

> > •           Пустой результат объяснён словами, а не пустым экраном и не ошибкой.

> > •           Команда может объяснить жюри, что происходит внутри пайплайна.

## **Оценка (для жюри)**

Приоритет: качество объяснений \> честная обработка редких, занятых и пустых категорий \> скорость \> интерфейс.

| Критерий | Что оцениваем | Баллы |
| :---- | :---- | :---- |
| Соответствие задаче и работоспособность | Оценивается, насколько решение соответствует поставленной задаче и позволяет реализовать основной заявленный сценарий. | 25 |
| Техническая реализация | Оценивается качество технической реализации решения: выбранный подход, архитектура, взаимодействие компонентов, использование AI/agentic AI и других технологий. Учитывается соответствие фактической реализации заявленной логике проекта. | 25 |
| README и воспроизводимость | Оценивается, насколько документация позволяет понять устройство проекта, используемые технологии, порядок запуска и основной сценарий работы. Также учитывается возможность воспроизвести и проверить решение на основании материалов репозитория. | 25 |
| Ценность и применимость решения | Оценивается, насколько решение отвечает обозначенной проблеме. Учитывается практическая применимость представленного подхода. | 15 |
| Потенциал развития и оригинальность подхода | Оценивается потенциал дальнейшего развития решения, его применения в более широком масштабе, а также наличие обоснованных нестандартных или оригинальных подходов к реализации задачи. | 10 |
| Итого | — | 100 |

# KZ

# **Хакатон-тапсырма: мердігерлерді ақылды іріктеу (\#79-lite)**

---

## **Контекст**

Сіз Қазақстандағы event-мердігерлердің агрегатор-алаңында жұмыс істейсіз. Тапсырыс беруші іс-шара түрін таңдап қойған және өз қаласы бойынша каталог алған. Сіздің міндетіңіз — тізімді ұзарту емес, осы тізімнен таңдауға көмектесу.

## **Міндет**

Сервис тапсырыс параметрлерін қабылдап, мердігерлердің 3-ке дейінгі карточкасын қайтарады, әрқайсысында осы мердігердің неліктен ұсынылғаны түсіндіріледі. Құндылық сұрыптауда емес, түсіндіруде.

## **Деректер**

hackathon-dataset-anonymized.jsonl — 66 профиль (сондай-ақ .csv және HTML-превью бар).

| өріс | бұл не |
| :---- | :---- |
| id, anon\_name | идентификатор және атау (есімдер ойдан шығарылған) |
| categories | мердігер санаттарының тізімі |
| city | Алматы / Астана / Шетел (Зарубежье) |
| price\_from\_kzt | «бастап» бағасы, бір іс-шара үшін ₸ |
| event\_formats | мердігер алатын форматтар: үйлену тойы, той, корпоратив, конференция, мерейтой, туған күн |
| languages | жұмыс тілдері: орыс, қазақ, ағылшын |
| max\_hours | алаңда болудың ең көп сағат саны; null — жұмыс қатысуға байланысты емес (флорист, декоратор, кәдесыйлар) |
| busy\_dates | 23.09.2026 — 31.12.2026 аралығындағы (100 күн) бос емес күндер. Алаңдардың күнтізбесі адамдардікімен бірдей |
| description | орыс тіліндегі еркін мәтін |
| synthetic, city\_imputed, price\_imputed | жалаушалар: 13 профиль толығымен синтетикалық, қалалар мен бағалардың бір бөлігі датасетті дайындау кезінде қойылған |

Деректер анонимдендірілген, бұл тұрғыда қосымша өңдеуді қажет етпейді.

Күнтізбелердің жүктемесі: қыркүйек-қараша — күндердің 30-50%-ы бос емес, желтоқсан — 70-80%. Желтоқсанда тығыз санаттарда демалыс күндеріне бос ешкім дерлік қалмайды: бұл датасеттің қатесі емес, маусым.

Жазбалар аз — сол форматта өз синтетикалық профильдеріңізді synthetic: true деп белгілеп қосуға болады. Демода қай профиль нақты, қайсысы сіздікі екені көрініп тұруы тиіс.

## **Талаптар**

> > 1\.        **Кіріс:** қала, іс-шара күні, іс-шара түрі, мердігер санаты, бюджет (₸). Қосымша — ұзақтығы (сағ) және тіл.

> > 2\.        **Шығыс:** 3-ке дейін карточка. Карточкада — атауы, санаты, қаласы, бағасы және 1–2 сөйлемнен тұратын түсіндірме: бюджет, формат, тіл, ұзақтық немесе сипаттаманың мағынасы бойынша сәйкестік. «Іс-шараңыз үшін тамаша таңдау» сияқты жалпы сөз тіркестері болмауы тиіс.

> > 3\.        Осы күні бос емес мердігер нәтижеге кірмейді. Алаңдар да сол каталогта және сол күнтізбемен: «14 қарашаға зал іріктеу» — дәл сондай сұраныс, тек санаты басқа.

> > 4\.        Сәйкес келетіндер үшеуден аз болса — барын көрсету және неге аз екенін айту.

> > 5\.        **Детерминизм:** бірдей сұраныс — карточкалардың бірдей реті.

> > 6\.        Үш нәтиже пайдаланушыға анық ажыратылады: іріктелді / бұл қалада мұндай санат жоқ / үміткерлер бар, бірақ ешқайсысы шарттарға сай келмейді (сол күні бос емес, бюджетке сыймайды, бұл форматты алмайды).

## **Не кірмейді**

> > •           Брондау, өтінімдер, мердігерге хабарламалар — тек ұсыныс.

> > •           Әдемі UI. Интерфейс пен түсіндірмелер сапасының арасында таңдау керек болса — түсіндірмелерді таңдаңыз.

> > •           Модельді 66 жазбада қосымша оқыту: бір күнде бұл тек датасетті қайталап айтуды береді. Дайын эмбеддингтер және API арқылы LLM — рұқсат.

## **Definition of Done**

Слайдта емес, тікелей тексеріледі.

> > •           Сұранысқа жауап ақылға қонымды уақытта келеді (бағдар — 10 секундқа дейін).

> > •           Түсіндірмелер бір-бірін алмастырмайды: есімдерді өшірсе, бір сұраныстың карточкаларын бір-бірімен шатастыру мүмкін емес.

> > •           Сол параметрлермен қайта іске қосу сол ретті береді.

> > •           Бір сұраныс екі түрлі күнге әртүрлі нәтиже береді және түсіндірмеде себеп бос еместікте екені көрінеді.

> > •           Кемінде үш сұраныс көрсетіледі:

–          күзгі күнге тығыз санат, мұнда рейтинг шынымен жұмыс істейді (Жүргізуші / Ведущий — 15 профиль, Фотограф — 12, Банкет залы / Банкетный зал — 8);

–          сирек санат (Флорист, Декоратор, Сыйлықтар мен кәдесыйлар / Подарки и сувениры, Рәсім жүргізушісі / Ведущий церемонии, Фото және бейнебудкалар / Фото и видеобудки, Қонақүй / Отель, Аспапшы / Инструменталист — әрқайсысы 3 профильден);

–          нәтижесіз сұраныс.

> > •           Бос нәтиже бос экранмен немесе қатемен емес, сөзбен түсіндіріледі.

> > •           Команда қазылар алқасына пайплайн ішінде не болып жатқанын түсіндіре алады.

## **Бағалау (қазылар үшін)**

Басымдық: түсіндірмелер сапасы \> сирек, бос емес және бос санаттарды адал өңдеу \> жылдамдық \> интерфейс.

| Критерий | Нені бағалаймыз | Ұпай |
| :---- | :---- | :---- |
| Тапсырмаға сәйкестігі және жұмыс істеу қабілеті | Шешімнің қойылған тапсырмаға қаншалықты сәйкес келетіні және мәлімделген негізгі сценарийді іске асыруға мүмкіндік беретіні бағаланады. | 25 |
| Техникалық іске асыру | Шешімнің техникалық іске асырылу сапасы бағаланады: таңдалған тәсіл, архитектура, компоненттердің өзара әрекеттесуі, AI/agentic AI және басқа технологияларды пайдалану. Нақты іске асырудың жобаның мәлімделген логикасына сәйкестігі ескеріледі. | 25 |
| README және қайта іске қосу мүмкіндігі | Құжаттаманың жоба құрылымын, пайдаланылған технологияларды, іске қосу тәртібін және негізгі жұмыс сценарийін түсінуге қаншалықты мүмкіндік беретіні бағаланады. Сондай-ақ репозиторий материалдары негізінде шешімді қайта іске қосу және тексеру мүмкіндігі ескеріледі. | 25 |
| Шешімнің құндылығы және қолданылуы | Шешімнің көрсетілген мәселені қаншалықты шешетіні бағаланады. Ұсынылған тәсілдің практикалық қолданылуы ескеріледі. | 15 |
| Даму әлеуеті және тәсілдің бірегейлігі | Шешімді одан әрі дамыту және оны кең ауқымда қолдану әлеуеті, сондай-ақ тапсырманы іске асырудағы негізделген стандарттан тыс немесе бірегей тәсілдердің болуы бағаланады. | 10 |
| Барлығы | — | 100 |

# EN

# **Hackathon Task: Smart Contractor Matching (\#79-lite)**

---

## **Background**

You work for an aggregator platform for event contractors in Kazakhstan. The client has already chosen the event type and received a catalog for their city. Your job is to help them choose from this list, not to make the list longer.

## **Task**

The service takes order parameters and returns up to 3 contractor cards, each with an explanation of why this contractor is there. The value lies in the explanation, not in the sorting.

## **Data**

hackathon-dataset-anonymized.jsonl — 66 profiles (a .csv and an HTML preview are also available).

| field | what it is |
| :---- | :---- |
| id, anon\_name | identifier and name (names are fictional) |
| categories | list of the contractor’s categories |
| city | Almaty / Astana / Abroad (Зарубежье) |
| price\_from\_kzt | starting price, ₸ per event |
| event\_formats | formats the contractor accepts: wedding, toi (Kazakh celebration), corporate event, conference, anniversary, birthday |
| languages | working languages: Russian, Kazakh, English |
| max\_hours | maximum hours on site; null means the work is not tied to on-site presence (florist, decorator, souvenirs) |
| busy\_dates | booked dates within the 23.09.2026 — 31.12.2026 window (100 days). Venues have the same kind of calendar as people |
| description | free text in Russian |
| synthetic, city\_imputed, price\_imputed | flags: 13 profiles are fully synthetic; some cities and prices were filled in during dataset preparation |

The data is anonymized and needs no further processing in that respect.

Calendar load: September to November — 30-50% of days booked, December — 70-80%. In December, almost no one in the busy categories is free on weekends: this is not a dataset bug, it’s the season.

There are few records, so you may add your own synthetic profiles in the same format, marked synthetic: true. The demo must make it clear which profiles are real and which are yours.

## **Requirements**

> > 1\.        **Input:** city, event date, event type, contractor category, budget (₸). Optional: duration (hours) and language.

> > 2\.        **Output:** up to 3 cards. Each card shows the name, category, city, price and a 1–2 sentence explanation: a match on budget, format, language, duration or the meaning of the description. There must be no generic phrases like “a great choice for your event”.

> > 3\.        A contractor booked on that date does not appear in the results. Venues are in the same catalog with the same calendar: “find a hall for November 14” is the same kind of request, just a different category.

> > 4\.        If fewer than three match, show as many as there are and say why there are fewer.

> > 5\.        **Determinism:** the same request gives the same card order.

> > 6\.        Three outcomes are clearly distinguishable for the user: matches found / no such category in this city / candidates exist, but none meet the conditions (booked on the date, over budget, don’t take this format).

## **Out of Scope**

> > •           Booking, requests, notifications to the contractor — recommendation only.

> > •           A polished UI. If you have to choose between the interface and the quality of explanations, choose the explanations.

> > •           Fine-tuning a model on 66 records: in one day this only produces a retelling of the dataset. Off-the-shelf embeddings and LLMs via API are welcome.

## **Definition of Done**

Checked live, not on a slide.

> > •           The response arrives in reasonable time (target: under 10 seconds).

> > •           Explanations are not interchangeable: with the names erased, the cards of one request cannot be confused with each other.

> > •           Re-running with the same parameters gives the same order.

> > •           The same request on two different dates gives different results, and the explanation shows that availability is the reason.

> > •           At least three requests are shown:

–          a busy category on an autumn date, where ranking really matters (Host / Ведущий — 15 profiles, Photographer / Фотограф — 12, Banquet hall / Банкетный зал — 8);

–          a rare category (Florist / Флорист, Decorator / Декоратор, Gifts and souvenirs / Подарки и сувениры, Ceremony host / Ведущий церемонии, Photo and video booths / Фото и видеобудки, Hotel / Отель, Instrumentalist / Инструменталист — 3 profiles each);

–          a request with no results.

> > •           An empty result is explained in words, not with a blank screen or an error.

> > •           The team can explain to the jury what happens inside the pipeline.

## **Evaluation (for the jury)**

Priority: quality of explanations \> honest handling of rare, booked and empty categories \> speed \> interface.

| Criterion | What is evaluated | Points |
| :---- | :---- | :---- |
| Compliance with the task and functionality | The assessment considers how well the solution meets the assigned task and enables the main stated scenario to be implemented. | 25 |
| Technical implementation | The quality of the solution’s technical implementation is assessed, including the selected approach, architecture, interaction between components, and use of AI/agentic AI and other technologies. The consistency of the actual implementation with the stated project logic is taken into account. | 25 |
| README and reproducibility | The assessment considers whether the documentation makes it possible to understand the project structure, technologies used, launch procedure, and main operating scenario. The possibility of reproducing and checking the solution based on the repository materials is also taken into account. | 25 |
| Value and applicability of the solution | The assessment considers how well the solution addresses the stated problem. The practical applicability of the proposed approach is taken into account. | 15 |
| Development potential and originality of the approach | The assessment considers the potential for further development of the solution and its use at a broader scale, as well as the presence of well-founded unconventional or original approaches to implementing the task. | 10 |
| Total | — | 100 |

