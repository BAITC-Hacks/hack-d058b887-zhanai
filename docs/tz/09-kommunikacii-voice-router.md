# **RU**

ТЕХНИЧЕСКОЕ ЗАДАНИЕ

1. Общие сведения

Заказчик: АО Народный Банк Казахстана

Хакатон: HackAlem AI

Трек: Halyk Bank

Название задачи: AI для корпоративных продуктов

Тип задачи: Product-разработка, AI/LLM-engineering, Full-stack

Инструменты: Разрешено использовать любые модели и сервисы: облачные и локальные LLM, STT, TTS.

2. Проблема

Компания ведёт два потока коммуникаций \- внутрь, с сотрудниками, и наружу, с клиентами. Оба работают на устаревшей логике.

**Внутренний контур** 

Карьера сотрудника \- это десятки событий: онбординг, обучение, аттестации, менторство, ротации. Они доходят до человека разрозненными уведомлениями с дедлайнами. Сотрудник не видит траектории и не понимает, что ему даст конкретная активность, поэтому проходит всё формально. Компания расходует бюджет на развитие полностью, но получает низкую завершаемость программ и слабую явку на добровольные активности.

**Внешний контур**

Голосовые роботы научились хорошо говорить и слышать. Но слой, выбирающий сценарий разговора, у большинства систем остаётся классификатором на энкодерной модели — обученным на фиксированных формулировках и ломающимся там, где начинается живая речь: смена темы посреди диалога, запрос между двумя сценариями, переход с русского на казахский внутри фразы. Каждый неверный выбор — перевод на оператора или потерянный клиент.

Общее у двух задач: узкое место не в технологии, а в слое принятия решения. И в обоих случаях его сегодня можно построить на LLM, понимающей контекст, а не сопоставляющей формулировки с обучающей выборкой.

3. Стейкхолдеры

**Пользователи:** сотрудники компании; HR-специалисты и руководители подразделений; клиенты контакт-центра; операторы и супервизоры.

**Ключевые боли:**

\- Как объяснить сотруднику, зачем ему конкретная активность и куда она ведёт?

\- Как сделать профессиональный рост видимым, чтобы он мотивировал?

\- Как научить робота понимать клиента, говорящего живым языком?

\- Как сделать это, не убив скорость — пауза дольше секунды в разговоре читается как сбой связи.

4. Выбор кейса

\- **Кейс 1: Career Quest** \- AI-навигатор развития сотрудника.

\- **Кейс 2: Voice Router** \- голосовой робот с AI-слоем выбора сценария

**КЕЙС: VOICE ROUTER**

1) Название. Voice Router \- гибридный голосовой AI-робот с LLM-слоем выбора сценария.

2) Проблема. Клиент контакт-центра сталкивается с роботом, который хорошо говорит и слышит, но выбирает сценарий классификатором на энкодерной модели, из\-за чего при смене темы, запросе на стыке сценариев или переходе между русским и казахским разговор уходит не туда: клиент переводится на оператора и в части случаев уходит вовсе.

3) Пользователь. Клиент контакт-центра: говорит своими словами → робот с первой реплики понимает суть и запускает нужный сценарий → при смене темы переключается, не теряя контекст → вопрос закрывается без оператора. Второй пользователь \- супервизор: видит, какие сценарии выбирались, где робот сомневался и ошибся.

4) Задача. Разработать голосового AI-робота с веб\-интерфейсом симуляции, который заменяет классификатор намерений на LLM-слой, понимающий контекст диалога, и выдаёт голосовой ответ клиенту плюс трассировку для супервизора: какой сценарий выбран, почему, за какое время. 

   Оценивается качество маршрутизации, а не качество синтеза и распознавания речи. Скорость — отдельный измеряемый показатель, дающий дополнительные баллы.

5) Вход: Вход: голосовая речь через микрофон, текст как резервный канал. Русский и казахский, включая переключение внутри диалога. Пример: «Здравствуйте, я вчера оплатил, деньги списались, а заказ не подтвердился… а, и ещё, адрес доставки поменять надо». Объём: 40 сценариев, диалог до 10 реплик.  
6) Выход: голосовой ответ и панель трассировки — транскрипт, выбранный сценарий с обоснованием, альтернативы, замер задержки по этапам. Допустимая задержка: ориентир по выбору сценария — 500 мс, от конца реплики до начала ответа — 1,5 секунды. Замеры отображаются в интерфейсе и учитываются в баллах, но не являются условием сдачи.

7) Данные и инструменты. Способ доступа: стартовый кит, выдаётся в день хакатона.

Состав:

— scenarios.json — 40 сценариев: назначение, границы с соседними сценариями, параметры, действия, примеры запросов и ответов на русском и казахском

— dialogs\_sample.json — 10 размеченных примеров диалогов, включая смену темы и смешанную речь

— knowledge\_base.json, mock\_backend.json — факты о компании и тестовые клиенты для ответов

— dev\_utterances.json и evaluate.py — размеченные реплики и скрипт для самостоятельного замера точности

Использование собственных моделей допускается, но преимуществом при оценке не является: кейс про маршрутизацию, а не про соревнование речевых моделей.

Компания в данных вымышленная (страховая), подробное описание в README стартового кита. 10 проверочных реплик с ожидаемыми сценариями хранятся у жюри и командам не выдаются.

Ограничения: каталог обезличен, реальных клиентских данных не содержит. Расширение собственными сценариями разрешено, оценка идёт по исходным сорока.

8) Must-have

| Требование | Проверка |
| :---- | :---- |
| Голосовое взаимодействие в вебе | Жюри говорит в микрофон \- робот распознаёт и отвечает голосом. Текст только как дополнение |
| Выбор сценария на LLM-слое | Команда показывает устройство слоя. Intent-классификатор энкодерного типа не засчитывается |
| Корректность выбора | Жюри зачитывает 10 одинаковых для всех реплик \- простые, со сменой темы, смешанной речью, на стыке сценариев. Считается доля попаданий |
| Панель трассировки | После каждой реплики виден сценарий, обоснование, альтернативы, время по этапам |
| Русский и казахский | Две реплики набора на казахском, одна со смешением языков внутри фразы |

9) Опционально. Гибридная архитектура — быстрый путь для очевидных запросов, LLM для сложных, с измеримым выигрышем по задержке; достижение ориентира в 500 мс; удержание контекста и возврат к прерванной теме; переспросить вместо угадывания и передать оператору вместе с контекстом; извлечение параметров из речи; потоковая обработка; определение эмоции и подстройка тона; панель супервизора со статистикой ошибок; редактирование каталога без разработчиков.  
10) Ограничения.

**Нельзя:** выбор сценария на готовом intent-классификаторе — ровно та архитектура, от которой уходит кейс. Хардкод сопоставления проверочных реплик со сценариями. Реальные записи разговоров.

**Учесть:**

— Приватность: данные синтетические; внешние API (LLM, STT, TTS) разрешены, реальные персональные данные в них не передаются

— Безопасность: робот не выполняет необратимых действий без подтверждения клиента

— Explainability: супервизор видит логику, а не голый вердикт

— Инфраструктура: запуск одной командой

— Производительность: задержка измеряется и даёт дополнительные баллы, но не снижает основную оценку

5. Минимальные требования

Решение принимает реальный пользовательский ввод, обрабатывает его с применением LLM в точке содержательного решения, а не для косметической генерации текста, возвращает результат с объяснением и работает на данных, а не на записанном демо-сценарии.

**AI помогает человеку, а не подменяет его.** В кейсе 1 решение о развитии остаётся за сотрудником и руководителем. В кейсе 2 робот обязан передавать разговор оператору там, где не справляется.

6. Жёсткие ограничения

\- AI не является единственным источником истины; где модель не уверена \- она это показывает

\- Решения должны быть объяснимыми

\- Не принимаются: «чёрный ящик»; демо на одном подготовленном сценарии; решения без реальной обработки данных; публичные рейтинги сотрудников (кейс 1); выбор сценария на intent-классификаторе (кейс 2\)

7\. Что ценится

Продуктовость \- пользователь работает без объяснений от разработчика. Объяснимость. Масштабируемость архитектуры. Учёт ограничений домена, а не только технической стороны: психология мотивации в кейсе 1, темп живого разговора в кейсе 2\. Честное обозначение границ применимости.

8\. Артефакты. Репозиторий: да. README: да. 

| Критерий | Что оцениваем | Баллы |
| :---- | :---- | :---- |
| Соответствие задаче и работоспособность | Оценивается, насколько решение соответствует поставленной задаче и позволяет реализовать основной заявленный сценарий. | 25 |
| Техническая реализация | Оценивается качество технической реализации решения: выбранный подход, архитектура, взаимодействие компонентов, использование AI/agentic AI и других технологий. Учитывается соответствие фактической реализации заявленной логике проекта. | 25 |
| README и воспроизводимость | Оценивается, насколько документация позволяет понять устройство проекта, используемые технологии, порядок запуска и основной сценарий работы. Также учитывается возможность воспроизвести и проверить решение на основании материалов репозитория. | 25 |
| Ценность и применимость решения | Оценивается, насколько решение отвечает обозначенной проблеме. Учитывается практическая применимость представленного подхода. | 15 |
| Потенциал развития и оригинальность подхода | Оценивается потенциал дальнейшего развития решения, его применения в более широком масштабе, а также наличие обоснованных нестандартных или оригинальных подходов к реализации задачи. | 10 |
| Итого | — | 100 |

# **KZ**

ТЕХНИКАЛЫҚ ТАПСЫРМА

 

1. Жалпы мәліметтер

Тапсырыс беруші: «Қазақстан Халық Банкі» АҚ

Хакатон: HackAlem AI

Трек: Halyk Bank

Тапсырманың атауы: Корпоративтік өнімдерге арналған AI

Тапсырма түрі: Product-әзірлеу, AI/LLM-engineering, Full-stack

Құралдар: Кез келген модельдер мен сервистерді пайдалануға рұқсат етіледі: бұлттық және жергілікті LLM, STT, TTS.

2. Мәселе

Компания екі коммуникация ағынын жүргізеді \- ішкі, қызметкерлермен, және сыртқы, клиенттермен. Екеуі де ескірген логикамен жұмыс істейді.

**Ішкі контур**

Қызметкердің мансабы \- ондаған оқиға: онбординг, оқыту, аттестаттау, тәлімгерлік, ротация. Олар адамға мерзімдері көрсетілген бытыраңқы хабарламалар түрінде жетеді. Қызметкер өз траекториясын көрмейді және нақты іс-шара оған не беретінін түсінбейді, сондықтан бәрін формалды түрде өтеді. Компания дамуға бөлінген бюджетті толық жұмсайды, бірақ бағдарламалардың аяқталу деңгейі төмен, ал ерікті іс-шараларға қатысу әлсіз.

**Сыртқы контур**

Дауыстық роботтар жақсы сөйлеуді және естуді үйренді. Бірақ көптеген жүйелерде сөйлесу сценарийін таңдайтын қабат әлі күнге дейін энкодерлік модельге негізделген классификатор болып қалуда — ол тұрақты тұжырымдарға үйретілген және тірі сөйлеу басталған жерде істен шығады: диалог ортасында тақырыптың ауысуы, екі сценарийдің арасындағы сұраныс, бір фраза ішінде орыс тілінен қазақ тіліне ауысу. Әрбір қате таңдау — операторға ауыстыру немесе жоғалған клиент.

Екі міндеттің ортақ тұсы: тар орын технологияда емес, шешім қабылдау қабатында. Екі жағдайда да бүгін оны тұжырымдарды оқыту іріктемесімен салыстыратын емес, контекстті түсінетін LLM негізінде құруға болады.

3. Стейкхолдерлер

**Пайдаланушылар:** компания қызметкерлері; HR-мамандар және бөлімше басшылары; контакт-орталық клиенттері; операторлар мен супервизорлар.

**Негізгі қиындықтар:**

\- Қызметкерге нақты іс-шараның не үшін қажет екенін және оның қайда апаратынын қалай түсіндіруге болады?

\- Кәсіби өсуді ынталандыратындай етіп қалай көрінетін етуге болады?

\- Роботты тірі тілде сөйлейтін клиентті түсінуге қалай үйретуге болады?

\- Мұны жылдамдықты жоғалтпай қалай жасауға болады — әңгімедегі бір секундтан ұзақ үзіліс байланыс ақауы ретінде қабылданады.

4. Кейсті таңдау

\- **1-кейс: Career Quest** \- қызметкерді дамытудың AI-навигаторы.

\- **2-кейс: Voice Router** \- сценарий таңдаудың AI-қабаты бар дауыстық робот

 

**КЕЙС: VOICE ROUTER**

1\)       Атауы. Voice Router \- сценарий таңдаудың LLM-қабаты бар гибридті дауыстық AI-робот.

2\)       Мәселе. Контакт-орталық клиенті жақсы сөйлейтін және еститін, бірақ сценарийді энкодерлік модельдегі классификатормен таңдайтын роботқа тап болады. Соның салдарынан тақырып ауысқанда, сценарийлер тоғысындағы сұраныста немесе орыс және қазақ тілдері арасында ауысқанда әңгіме басқа арнаға кетеді: клиент операторға ауыстырылады, ал кейбір жағдайларда мүлдем кетіп қалады.

3\)       Пайдаланушы. Контакт-орталық клиенті: өз сөзімен сөйлейді → робот бірінші репликадан-ақ мәнін түсініп, қажетті сценарийді іске қосады → тақырып ауысқанда контекстті жоғалтпай ауысады → мәселе операторсыз шешіледі. Екінші пайдаланушы \- супервизор: қандай сценарийлер таңдалғанын, робот қай жерде күмәнданғанын және қателескенін көреді.

4\)       Міндет. Симуляцияның веб\-интерфейсі бар дауыстық AI-роботты әзірлеу: ол ниет классификаторын диалог контекстін түсінетін LLM-қабатпен алмастырады және клиентке дауыстық жауап, ал супервизорға трассировка береді: қандай сценарий таңдалды, неліктен және қанша уақытта.

Сөйлеуді синтездеу мен тану сапасы емес, маршруттау сапасы бағаланады. Жылдамдық — қосымша ұпай беретін жеке өлшенетін көрсеткіш.

5\)       Кіріс: микрофон арқылы дауыстық сөйлеу, резервтік арна ретінде мәтін. Орыс және қазақ тілдері, соның ішінде диалог ішінде тілді ауыстыру. Мысал: «Сәлеметсіз бе, мен кеше төлем жасадым, ақша шешілді, бірақ тапсырыс расталмады… иә, тағы бір нәрсе, жеткізу мекенжайын өзгерту керек». Көлемі: 40 сценарий, 10 репликаға дейінгі диалог.  
6\)       Шығыс: дауыстық жауап және трассировка панелі — транскрипт, негіздемесі бар таңдалған сценарий, баламалар, кезеңдер бойынша кідірісті өлшеу. Рұқсат етілген кідіріс: сценарийді таңдау бойынша бағдар — 500 мс, репликаның соңынан жауаптың басталуына дейін — 1,5 секунд. Өлшемдер интерфейсте көрсетіледі және ұпайларда ескеріледі, бірақ тапсыру шарты болып табылмайды.

7\)       Деректер және құралдар. Қол жеткізу тәсілі: хакатон күні берілетін стартерлік жинақ (starter kit).

Құрамы:

— scenarios.json — 40 сценарий: мақсаты, көршілес сценарийлермен шекаралары, параметрлері, әрекеттері, орыс және қазақ тілдеріндегі сұраныстар мен жауаптардың мысалдары

— dialogs\_sample.json — тақырып ауысуы мен аралас сөйлеуді қоса алғанда, белгіленген 10 диалог мысалы

— knowledge\_base.json, mock\_backend.json — жауаптарға арналған компания туралы фактілер және тестілік клиенттер

— dev\_utterances.json және evaluate.py — белгіленген репликалар және дәлдікті өз бетінше өлшеуге арналған скрипт

Өз модельдеріңізді пайдалануға рұқсат етіледі, бірақ бағалау кезінде артықшылық бермейді: кейс сөйлеу модельдерінің жарысы туралы емес, маршруттау туралы.

Деректердегі компания ойдан шығарылған (сақтандыру компаниясы), толық сипаттамасы стартерлік жинақтың README файлында. Күтілетін сценарийлері бар 10 тексеру репликасы қазылар алқасында сақталады және командаларға берілмейді.

Шектеулер: каталог иесіздендірілген, нақты клиенттік деректерді қамтымайды. Өз сценарийлеріңізбен кеңейтуге рұқсат етіледі, бағалау бастапқы қырық сценарий бойынша жүргізіледі.

8\)       Must-have

| Талап | Тексеру |
| :---- | :---- |
| Вебтегі дауыстық өзара әрекеттесу | Қазылар микрофонға сөйлейді \- робот сөзді таниды және дауыспен жауап береді. Мәтін тек қосымша ретінде |
| LLM-қабатта сценарий таңдау | Команда қабаттың құрылымын көрсетеді. Энкодерлік типтегі intent-классификатор есептелмейді |
| Таңдаудың дұрыстығы | Қазылар барлығына бірдей 10 репликаны оқиды \- қарапайым, тақырып ауысатын, аралас сөйлеу, сценарийлер тоғысындағы. Дәл келу үлесі есептеледі |
| Трассировка панелі | Әр репликадан кейін сценарий, негіздеме, баламалар, кезеңдер бойынша уақыт көрінеді |
| Орыс және қазақ тілдері | Жиынтықтағы екі реплика қазақ тілінде, біреуі фраза ішінде тілдер араласқан |

 

9\)  	Қосымша. Гибридті архитектура — айқын сұраныстар үшін жылдам жол, күрделілері үшін LLM, кідіріс бойынша өлшенетін ұтыспен; 500 мс бағдарына жету; контекстті ұстап тұру және үзілген тақырыпқа оралу; болжаудың орнына қайта сұрау және операторға контекстімен бірге беру; сөйлеуден параметрлерді алу; ағындық өңдеу; эмоцияны анықтау және үнді бейімдеу; қателер статистикасы бар супервизор панелі; каталогты әзірлеушілерсіз өңдеу.  
10\)   Шектеулер.

**Болмайды:** дайын intent-классификаторда сценарий таңдау — кейс дәл осы архитектурадан бас тартады. Тексеру репликаларын сценарийлермен сәйкестендіруді хардкодтау. Әңгімелердің нақты жазбалары.

**Ескеру қажет:**

— Құпиялылық: деректер синтетикалық; сыртқы API-ларға (LLM, STT, TTS) рұқсат етіледі, оларға нақты дербес деректер берілмейді

— Қауіпсіздік: робот клиенттің растауынсыз қайтымсыз әрекеттер жасамайды

— Explainability: супервизор жалаң үкімді емес, логиканы көреді

— Инфрақұрылым: бір командамен іске қосу

— Өнімділік: кідіріс өлшенеді және қосымша ұпай береді, бірақ негізгі бағаны төмендетпейді

5. Ең төменгі талаптар

Шешім нақты пайдаланушы енгізуін қабылдайды, оны мәтінді косметикалық генерациялау үшін емес, мазмұнды шешім қабылдау нүктесінде LLM қолдана отырып өңдейді, нәтижені түсіндірмесімен қайтарады және жазылған демо-сценарийде емес, деректерде жұмыс істейді.

**AI адамның орнын баспайды, оған көмектеседі.** 1-кейсте даму туралы шешім қызметкер мен басшыда қалады. 2-кейсте робот өзі шеше алмаған жерде әңгімені операторға беруге міндетті.

6. Қатаң шектеулер

\- AI ақиқаттың жалғыз көзі болып табылмайды; модель сенімді болмаған жерде оны көрсетеді

\- Шешімдер түсіндірмелі болуы тиіс

\- Қабылданбайды: «қара жәшік»; бір дайындалған сценарийдегі демо; деректерді нақты өңдеусіз шешімдер; қызметкерлердің ашық рейтингтері (1-кейс); intent-классификаторда сценарий таңдау (2-кейс)

7\. Не бағаланады

Өнімге бағдарлану \- пайдаланушы әзірлеушінің түсіндірмесінсіз жұмыс істей алады. Түсіндірмелілік. Архитектураның масштабталуы. Тек техникалық жағын ғана емес, домен шектеулерін де ескеру: 1-кейсте мотивация психологиясы, 2-кейсте тірі әңгіменің қарқыны. Қолданылу шекараларын адал көрсету.

8\. Артефактілер. Репозиторий: иә. README: иә.

| Критерий | Нені бағалаймыз | Ұпай |
| :---- | :---- | :---- |
| Тапсырмаға сәйкестігі және жұмыс істеу қабілеті | Шешімнің қойылған тапсырмаға қаншалықты сәйкес келетіні және мәлімделген негізгі сценарийді іске асыруға мүмкіндік беретіні бағаланады. | 25 |
| Техникалық іске асыру | Шешімнің техникалық іске асырылу сапасы бағаланады: таңдалған тәсіл, архитектура, компоненттердің өзара әрекеттесуі, AI/agentic AI және басқа технологияларды пайдалану. Нақты іске асырудың жобаның мәлімделген логикасына сәйкестігі ескеріледі. | 25 |
| README және қайта іске қосу мүмкіндігі | Құжаттаманың жоба құрылымын, пайдаланылған технологияларды, іске қосу тәртібін және негізгі жұмыс сценарийін түсінуге қаншалықты мүмкіндік беретіні бағаланады. Сондай-ақ репозиторий материалдары негізінде шешімді қайта іске қосу және тексеру мүмкіндігі ескеріледі. | 25 |
| Шешімнің құндылығы және қолданылуы | Шешімнің көрсетілген мәселені қаншалықты шешетіні бағаланады. Ұсынылған тәсілдің практикалық қолданылуы ескеріледі. | 15 |
| Даму әлеуеті және тәсілдің бірегейлігі | Шешімді одан әрі дамыту және оны кең ауқымда қолдану әлеуеті, сондай-ақ тапсырманы іске асырудағы негізделген стандарттан тыс немесе бірегей тәсілдердің болуы бағаланады. | 10 |
| Барлығы | — | 100 |

# **EN**

TECHNICAL SPECIFICATION

 

1. General Information

Client: Halyk Bank of Kazakhstan JSC

Hackathon: HackAlem AI

Track: Halyk Bank

Task name: AI for Corporate Products

Task type: Product development, AI/LLM engineering, Full-stack

Tools: Any models and services may be used: cloud and local LLMs, STT, TTS.

2. Problem

The company runs two communication streams: internal, with employees, and external, with customers. Both run on outdated logic.

**Internal Loop**

An employee's career consists of dozens of events: onboarding, training, performance reviews, mentoring, rotations. They reach the person as scattered notifications with deadlines. The employee doesn't see a trajectory and doesn't understand what a given activity will give them, so they go through everything as a formality. The company spends its full development budget but gets low program completion rates and weak turnout for voluntary activities.

**External Loop**

Voice bots have learned to speak and listen well. But in most systems, the layer that selects the conversation scenario is still an encoder-based classifier: trained on fixed phrasings and breaking down where natural speech begins, such as a topic change mid-dialogue, a request that falls between two scenarios, or a switch from Russian to Kazakh within a single phrase. Every wrong choice means a transfer to an operator or a lost customer.

What the two problems have in common: the bottleneck is not the technology but the decision-making layer. In both cases, it can now be built on an LLM that understands context rather than matching phrasings against a training set.

3. Stakeholders

**Users:** company employees; HR specialists and department heads; contact center customers; operators and supervisors.

**Key pain points:**

\- How do you explain to an employee why a specific activity matters to them and where it leads?

\- How do you make professional growth visible so that it motivates?

\- How do you teach a bot to understand a customer who speaks naturally?

\- How do you do this without killing speed? A pause longer than one second in a conversation reads as a connection failure.

4. Case Selection

\- **Case 1: Career Quest** \- an AI navigator for employee development.

\- **Case 2: Voice Router** \- a voice bot with an AI scenario-selection layer

 

**CASE: VOICE ROUTER**

1\)       Name. Voice Router \- a hybrid voice AI bot with an LLM scenario-selection layer.

2\)       Problem. A contact center customer encounters a bot that speaks and listens well but selects scenarios with an encoder-based classifier. As a result, when the topic changes, when a request falls at the boundary between scenarios, or when the customer switches between Russian and Kazakh, the conversation goes off track: the customer is transferred to an operator and, in some cases, leaves altogether.

3\)       User. Contact center customer: speaks in their own words → from the first utterance, the bot grasps the point and launches the right scenario → when the topic changes, it switches without losing context → the issue is resolved without an operator. The second user is the supervisor, who sees which scenarios were selected and where the bot was uncertain or made mistakes.

4\)       Task. Develop a voice AI bot with a web simulation interface that replaces the intent classifier with an LLM layer that understands dialogue context, and provides a voice response to the customer plus a trace for the supervisor: which scenario was selected, why, and how long it took.

Routing quality is evaluated, not the quality of speech synthesis or recognition. Speed is a separate measured metric that earns bonus points.

5\)       Input: voice speech via microphone, with text as a fallback channel. Russian and Kazakh, including switching within a dialogue. Example: "Hello, I paid yesterday, the money was debited, but the order wasn't confirmed… oh, and also, I need to change the delivery address." Scope: 40 scenarios, dialogues of up to 10 turns.  
6\)       Output: voice response and a trace panel showing the transcript, the selected scenario with its rationale, alternatives, and latency measured per stage. Acceptable latency: the target for scenario selection is 500 ms; from the end of the utterance to the start of the response, 1.5 seconds. Measurements are displayed in the interface and count toward the score, but are not a submission requirement.

7\)       Data and Tools. Access: starter kit, provided on the day of the hackathon.

Contents:

— scenarios.json — 40 scenarios: purpose, boundaries with neighboring scenarios, parameters, actions, sample requests and responses in Russian and Kazakh

— dialogs\_sample.json — 10 annotated sample dialogues, including topic changes and mixed-language speech

— knowledge\_base.json, mock\_backend.json — company facts and test customers for responses

— dev\_utterances.json and evaluate.py — annotated utterances and a script for measuring accuracy on your own

Using your own models is allowed but gives no advantage in evaluation: this case is about routing, not a competition between speech models.

The company in the data is fictional (an insurance company); a detailed description is in the starter kit README. The 10 test utterances with expected scenarios are held by the jury and are not given to teams.

Constraints: the catalog is anonymized and contains no real customer data. Extending it with your own scenarios is allowed; evaluation is based on the original forty.

8\)       Must-have

| Requirement | Verification |
| :---- | :---- |
| Voice interaction on the web | The jury speaks into the microphone \- the bot recognizes the speech and responds by voice. Text only as a supplement |
| Scenario selection via an LLM layer | The team demonstrates how the layer works. An encoder-type intent classifier does not count |
| Selection accuracy | The jury reads the same 10 utterances for all teams \- simple ones, with topic changes, mixed-language speech, and at scenario boundaries. The hit rate is calculated |
| Trace panel | After each utterance, the scenario, rationale, alternatives, and per-stage timing are visible |
| Russian and Kazakh | Two utterances in the set are in Kazakh, one mixes languages within a phrase |

 

9\)  	Optional. Hybrid architecture: a fast path for obvious requests and an LLM for complex ones, with a measurable latency gain; reaching the 500 ms target; retaining context and returning to an interrupted topic; asking for clarification instead of guessing and handing off to an operator along with the context; extracting parameters from speech; streaming processing; emotion detection and tone adjustment; a supervisor panel with error statistics; catalog editing without developers.  
10\)   Constraints.

**Not allowed:** scenario selection using an off-the-shelf intent classifier, which is exactly the architecture this case is moving away from. Hardcoding the mapping of test utterances to scenarios. Real call recordings.

**Take into account:**

— Privacy: the data is synthetic; external APIs (LLM, STT, TTS) are allowed, and no real personal data is sent to them

— Safety: the bot does not perform irreversible actions without customer confirmation

— Explainability: the supervisor sees the reasoning, not just a bare verdict

— Infrastructure: launch with a single command

— Performance: latency is measured and earns bonus points but does not lower the main score

5. Minimum Requirements

The solution accepts real user input, processes it using an LLM at the point of the substantive decision (not for cosmetic text generation), returns the result with an explanation, and runs on data rather than a pre-recorded demo scenario.

**AI helps people rather than replacing them.** In Case 1, development decisions remain with the employee and their manager. In Case 2, the bot must hand the conversation over to an operator wherever it cannot cope.

6. Hard Constraints

\- AI is not the sole source of truth; where the model is uncertain, it shows this

\- Decisions must be explainable

\- Not accepted: a "black box"; a demo built on a single prepared scenario; solutions without real data processing; public employee rankings (Case 1); scenario selection via an intent classifier (Case 2\)

7\. What Is Valued

Product quality \- the user can work without explanations from the developer. Explainability. Architecture scalability. Accounting for domain constraints, not just the technical side: the psychology of motivation in Case 1, the pace of live conversation in Case 2\. Honest disclosure of the limits of applicability.

8\. Deliverables. Repository: yes. README: yes.

| Criterion | What is evaluated | Points |
| :---- | :---- | :---- |
| Compliance with the task and functionality | The assessment considers how well the solution meets the assigned task and enables the main stated scenario to be implemented. | 25 |
| Technical implementation | The quality of the solution’s technical implementation is assessed, including the selected approach, architecture, interaction between components, and use of AI/agentic AI and other technologies. The consistency of the actual implementation with the stated project logic is taken into account. | 25 |
| README and reproducibility | The assessment considers whether the documentation makes it possible to understand the project structure, technologies used, launch procedure, and main operating scenario. The possibility of reproducing and checking the solution based on the repository materials is also taken into account. | 25 |
| Value and applicability of the solution | The assessment considers how well the solution addresses the stated problem. The practical applicability of the proposed approach is taken into account. | 15 |
| Development potential and originality of the approach | The assessment considers the potential for further development of the solution and its use at a broader scale, as well as the presence of well-founded unconventional or original approaches to implementing the task. | 10 |
| Total | — | 100 |

