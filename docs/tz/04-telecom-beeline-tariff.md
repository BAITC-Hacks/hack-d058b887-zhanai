# **RU**

# **Beeline Tariff Marketing Campaigns Case**

### ТЗ для участников хакатона

**23 441 абонент. 100 000 у.е. бюджета. 20 пилотов. 9 часов.** Постройте агента, который решит, кому предложить сменить тариф — и не разорит компанию по дороге.

⚠️ **Все данные и цифры в этом кейсе синтезированы специально для хакатона.** Это не выгрузка из систем Beeline и не реальные показатели компании: объёмы, тарифы, суммы, доли и эффекты сгенерированы для учебной задачи. Любые выводы о реальном бизнесе оператора на их основе некорректны.

## **1\. Название**

Агент управления тарифными маркетинговыми кампаниями.

## **2\. Проблема**

Beeline зарабатывает на тарифах, и ключевая метрика здесь — **ARPU** (средняя выручка на абонента). Чтобы её растить, компания постоянно проводит маркетинговые кампании: выбирает сегмент абонентов, предлагает им перейти на другой тариф и доносит это через какой-то канал связи.

Проблема в том, что кампания «вслепую» уходит в минус. Значительная часть смен тарифа заканчивается **downsell** — абонент после перехода платит *меньше*, чем платил до; ещё часть переходов не меняет ничего. То есть заметная доля контактов — это деньги без результата или прямой ущерб выручке. Сам контакт тоже не бесплатен: звонка на весь бюджет хватит лишь на 625 человек из 23 тысяч.

Сегодня процесс уже data-driven: сегментация по данным потребления, ML-модели склонности, проверка гипотез на истории. Но решение «какие кампании запустить и как поделить бюджет» принимает аналитик вручную — это долго, и часть вариантов просто не успевают рассмотреть.

## **3\. Пользователь**

**Основной пользователь:** аналитик маркетинга, планирующий кампании на следующий месяц.

**Ключевой сценарий:** запускает агента на текущей базе → агент сам исследует данные, проверяет гипотезы пилотными кампаниями и возвращает готовый план: какие кампании, на какие сегменты, через какие каналы и как потратить бюджет.

## **4\. Задача**

Разработать **агентскую систему**, которая выбирает маркетинговые кампании и выдаёт план из **максимум 10 кампаний**. Одна кампания — три решения:

|  | Решение | Из чего выбирать |
| :---- | :---- | :---- |
| **Кого** | сегмент абонентов | ARPU, потребление данных и звонков, текущий тариф |
| **Что** | целевой тариф | любой из 21 |
| **Как** | канал коммуникации | push / SMS / реклама / звонок |

**Главная сложность — неполная информация.** Выданная история описывает *другую* выборку абонентов, а не ту, на которой считается результат. Как поведёт себя целевая аудитория, заранее неизвестно. Узнать можно только **пилотом** — запустить кампанию на малой выборке и посмотреть.

Но пилот врёт: **пилот на 30 клиентах назовёт убыточным умеренно прибыльный сегмент примерно в каждом четвёртом случае**. На 200 клиентах — в одном из двадцати пяти, но и стоит он в семь раз дороже, из того же бюджета, что и сами кампании. При этом стратегия без разведки приносит **в \~15 раз меньше**, чем знающая истинные эффекты: разведка — основной источник результата.

## **5\. Вход → выход**

**Вход** — объект среды env, который получает метод act():

class Agent:  
    def act(self, env) \-\> list\[dict\]:  
        \# env.customer\_profile   — DataFrame аудитории (23 441 абонент)  
        \# env.tariffs, env.channels  
        \# env.remaining\_budget, env.remaining\_contacts, env.pilots\_left  
        \# env.run\_pilot(target\_tariff=..., channel=..., n\_customers=...,  
        \#               filter\_arpu\_segment=..., filter\_current\_tariff=...)  
        \# env.pilot\_history      — ваши пилоты и их результаты  
        return \[...\]   \# до 10 кампаний

**Выход** — список словарей. Обязательны target\_tariff и channel, фильтры опциональны (пропущен \= не фильтровать):

{"campaign\_name": "Premium Upsell", "filter\_arpu\_segment": "HIGH",  
 "filter\_data\_segment": "HEAVY", "filter\_current\_tariff": "tariff\_4;tariff\_8",  
 "target\_tariff": "tariff\_10", "channel": "sms"}

**Как считается результат.** Эффект кампании — это **процент** от ARPU конкретного абонента, а не фиксированная сумма: один и тот же переход на дорогом абоненте приносит больше.

Чистый результат \= Прирост ARPU (по уникальным абонентам)  
                   − Затраты на коммуникацию (контакты × стоимость канала)

Если не делать ничего, аудитория принесёт **150 641 084** (сумма колонки predicted\_arpu). Побеждает тот, чей чистый результат больше. В зачёт идут **и пилоты, и финальные кампании** — пилотные контакты тоже реальные.

| Канал | Стоимость контакта | Эффективность |
| :---- | :---- | :---- |
| push | бесплатно | низкая (×0.50) |
| sms | 4 у.е. | средняя (×0.65) |
| digital\_ads | 22 у.е. | выше среднего (×0.85) |
| call | 160 у.е. | высокая (×1.20) |

## **6\. Данные**

Всё в пакете участника. Данные синтетические (см. оговорку в начале): \~23 тысячи абонентов, период 2026 год, тарифы обозначены tariff\_1…tariff\_21 и не отражают действующую линейку, суммы — в условных единицах.

| Файл | Что внутри |
| :---- | :---- |
| customer\_profile.csv | **аудитория кампаний**: 23 441 абонент, текущий тариф, сегменты, поведение, predicted\_arpu |
| data/change\_tariff.csv | история 14 824 смен тарифов с ARPU до и после |
| data/traffic.csv | потребление (минуты, SMS, трафик, устройство) по месяцам |
| data/arpu\_monthly.csv | месячная выручка по абонентам |
| data/dict\_tariff.csv | параметры 21 тарифа (цена, пакеты) |
| tariff\_dictionary.csv, feature\_dictionary.csv | описания тарифов и всех колонок |

**Сегменты в customer\_profile.csv:**

| Колонка | Значения | Порог |
| :---- | :---- | :---- |
| arpu\_segment | LOW / MID / HIGH | по ARPU\_3m\_avg: \<1000, 1000–5000, \>5000 |
| data\_segment | NON\_USER / LITE / HEAVY | 0 МБ/мес, 0–2000, \>2000 |
| call\_segment | LOW / MEDIUM / HIGH | \<100 мин/мес, 100–400, \>400 |

Готовой таблицы «тариф A → тариф B \= \+X ARPU» в комплекте нет — иначе задача свелась бы к сортировке одной колонки. Оценку эффекта агент строит сам.

## **7\. Must have**

Без этого решение не засчитывается. Всё проверяется одной командой python local\_eval.py:

1. **Файл agent.py с классом Agent и методом act(env)**, запускается без ошибок. *Проверка:* local\_eval.py отрабатывает и печатает результат.

2. **От 1 до 10 корректных кампаний** с существующими тарифами и каналами. *Проверка:* в выводе нет строк «Кампания … отброшена».

3. **Агент использует пилоты** (env.run\_pilot) и опирается на их результаты, а не действует по зашитым константам. *Проверка:* в выводе Пилотов проведено    \> 0, логика видна в коде.

4. **Агент укладывается в лимиты** бюджета, охвата и числа пилотов. *Проверка:* прогон завершается без превышений.

5. **Файл submission.csv** из команды python make\_submission.py. *Проверка:* файл есть и воспроизводится нашим запуском.

## **8\. Опционально**

Дают преимущество, но не блокируют сдачу:

* **Учёт неопределённости:** агент оценивает не только среднее по пилоту, но и его надёжность (пилот на 150 клиентах точнее, чем на 30).

* **Адаптивная разведка:** размер и число пилотов зависят от уже выясненного, а не заданы жёстко.

* **Осмысленный выбор канала** под ценность сегмента, а не один канал на всё.

* **Устойчивость:** результат не разваливается при неудачной серии пилотов (python local\_eval.py \--runs 10 — знак не должен скакать).

* **LLM в контуре принятия решений** — разрешено и приветствуется.

## **9\. Ограничения**

**Лимиты (действуют одновременно):**

* максимум **10 кампаний**;

* максимум **5 000 абонентов на кампанию** (сверх — не засчитывается);

* максимум **15 000 контактов** суммарно, включая пилотные;

* бюджет **100 000 у.е.** на все контакты, включая пилотные;

* максимум **20 пилотов**, по 10–200 абонентов в каждом;

* **каждый абонент засчитывается один раз** — по лучшей для него кампании. Продублировать удачную кампанию и умножить эффект нельзя, а лишние контакты всё равно стоят денег.

**Нельзя:**

* лезть во внутренности среды в обход пилотов (\_\_closure\_\_, gc, чтение файлов организатора и подобное) — **результат аннулируется**, код проверяется автоматически;

* хардкодить секреты: ключ к LLM берите из os.environ\["OPENAI\_API\_KEY"\], на судействе его подставим мы.

**Обязательно учесть:**

* агент работает **не дольше 10 минут**, включая все вызовы модели;

* LLM API может ответить ошибкой — оборачивайте вызовы в try/except и имейте запасную логику. Если агент упадёт, проведённые пилоты всё равно пойдут в зачёт, но результат будет отрицательным;

* эффекты на судействе **другие**, чем в мок-среде: настраивайте логику, а не константы под мок.

## **10\. Артефакты**

| Артефакт | Обязателен |
| :---- | :---- |
| agent.py | да |
| submission.csv (генерируется make\_submission.py) | да |
| requirements.txt | если нужны библиотеки |
| README с описанием подхода | нет, но помогает при разборе |

**Проверка себя перед сдачей:** python local\_eval.py (прогон \+ отчёт), \--runs 10 (устойчивость по разным seed), python make\_submission.py.

local\_eval.py считает результат **тем же кодом**, что и на судействе, но на мок-эффектах — показывает механику и поведение агента, а не будущий балл. Пример для старта — agent\_template.py (намеренно слабый, обыграть несложно).

| Критерий | Что оцениваем | Баллы |
| :---- | :---- | :---- |
| Соответствие задаче и работоспособность | Оценивается, насколько решение соответствует поставленной задаче и позволяет реализовать основной заявленный сценарий. | 25 |
| Техническая реализация | Оценивается качество технической реализации решения: выбранный подход, архитектура, взаимодействие компонентов, использование AI/agentic AI и других технологий. Учитывается соответствие фактической реализации заявленной логике проекта. | 25 |
| README и воспроизводимость | Оценивается, насколько документация позволяет понять устройство проекта, используемые технологии, порядок запуска и основной сценарий работы. Также учитывается возможность воспроизвести и проверить решение на основании материалов репозитория. | 25 |
| Ценность и применимость решения | Оценивается, насколько решение отвечает обозначенной проблеме. Учитывается практическая применимость представленного подхода. | 15 |
| Потенциал развития и оригинальность подхода | Оценивается потенциал дальнейшего развития решения, его применения в более широком масштабе, а также наличие обоснованных нестандартных или оригинальных подходов к реализации задачи. | 10 |
| Итого | — | 100 |

 

 

# **KZ**

# **Beeline Tariff Marketing Campaigns Case**

### **Хакатон қатысушыларына арналған техникалық тапсырма**

**23 441 абонент. 100 000 ш.б. бюджет. 20 пилот. 9 сағат.** Тарифті ауыстыруды кімге ұсыну керектігін шешетін және жолай компанияны күйзеліске ұшыратпайтын агент құрыңыз.

⚠️ **Бұл кейстегі барлық деректер мен сандар хакатон үшін арнайы синтезделген.** Бұл Beeline жүйелерінен алынған үзінді емес және компанияның нақты көрсеткіштері емес: көлемдер, тарифтер, сомалар, үлестер мен әсерлер оқу тапсырмасы үшін генерацияланған. Олардың негізінде оператордың нақты бизнесі туралы жасалған кез келген қорытынды дұрыс емес.

## **1\. Атауы**

Тарифтік маркетингтік науқандарды басқару агенті.

## **2\. Мәселе**

Beeline тарифтерден табыс табады, және мұндағы негізгі метрика — **ARPU** (бір абонентке шаққандағы орташа түсім). Оны өсіру үшін компания үнемі маркетингтік науқандар өткізеді: абоненттер сегментін таңдайды, оларға басқа тарифке ауысуды ұсынады және мұны қандай да бір байланыс арнасы арқылы жеткізеді.

Мәселе мынада: «соқыр» өткізілген науқан шығынға кетеді. Тарифті ауыстырудың едәуір бөлігі **downsell**\-мен аяқталады — абонент ауысқаннан кейін бұрынғыдан *аз* төлейді; тағы бір бөлігі ештеңені өзгертпейді. Яғни байланыстардың айтарлықтай үлесі — нәтижесіз жұмсалған ақша немесе түсімге тікелей зиян. Байланыстың өзі де тегін емес: бүкіл бюджетке 23 мың адамның тек 625-іне ғана қоңырау шалуға жетеді.

Бүгінде процесс қазірдің өзінде data-driven: тұтыну деректері бойынша сегменттеу, бейімділіктің ML-модельдері, гипотезаларды тарихта тексеру. Бірақ «қандай науқандарды іске қосу және бюджетті қалай бөлу» туралы шешімді талдаушы қолмен қабылдайды — бұл ұзаққа созылады, және нұсқалардың бір бөлігін қарап үлгермейді.

## **3\. Пайдаланушы**

**Негізгі пайдаланушы:** келесі айға науқандарды жоспарлайтын маркетинг талдаушысы.

**Негізгі сценарий:** агентті ағымдағы базада іске қосады → агент деректерді өзі зерттейді, гипотезаларды пилоттық науқандармен тексереді және дайын жоспарды қайтарады: қандай науқандар, қандай сегменттерге, қандай арналар арқылы және бюджетті қалай жұмсау керек.

## **4\. Міндет**

Маркетингтік науқандарды таңдайтын және **ең көбі 10 науқаннан** тұратын жоспар беретін **агенттік жүйе** әзірлеу. Бір науқан — үш шешім:

|   | Шешім | Неден таңдау керек |
| :---- | :---- | :---- |
| **Кімге** | абоненттер сегменті | ARPU, деректер мен қоңырауларды тұтыну, ағымдағы тариф |
| **Не** | мақсатты тариф | 21 тарифтің кез келгені |
| **Қалай** | коммуникация арнасы | push / SMS / жарнама / қоңырау |

**Басты қиындық — толық емес ақпарат.** Берілген тарих нәтиже есептелетін абоненттерді емес, *басқа* іріктемені сипаттайды. Мақсатты аудиторияның қалай әрекет ететіні алдын ала белгісіз. Мұны тек **пилот** арқылы білуге болады — науқанды шағын іріктемеде іске қосып, нәтижені көру.

Бірақ пилот алдайды: **30 клиенттегі пилот орташа табысты сегментті шамамен әрбір төртінші жағдайда шығынды деп атайды**. 200 клиентте — жиырма бестің бірінде, бірақ оның құны жеті есе қымбат және ол науқандардың өзімен бірдей бюджеттен төленеді. Сонымен қатар барлаусыз стратегия нақты әсерлерді білетін стратегиядан **\~15 есе аз** табыс әкеледі: барлау — нәтиженің негізгі көзі.

## **5\. Кіріс → шығыс**

**Кіріс** — act() әдісі алатын env орта объектісі:

class Agent:  
 	def act(self, env) \-\> list\[dict\]:  
     	\# env.customer\_profile   — аудитория DataFrame-і (23 441 абонент)  
     	\# env.tariffs, env.channels  
     	\# env.remaining\_budget, env.remaining\_contacts, env.pilots\_left  
     	\# env.run\_pilot(target\_tariff=..., channel=..., n\_customers=...,  
     	\#           	filter\_arpu\_segment=..., filter\_current\_tariff=...)  
     	\# env.pilot\_history  	— сіздің пилоттарыңыз және олардың нәтижелері  
     	return \[...\]   \# 10 науқанға дейін

**Шығыс** — сөздіктер тізімі. target\_tariff және channel міндетті, сүзгілер опционалды (көрсетілмесе \= сүзбеу):

{"campaign\_name": "Premium Upsell", "filter\_arpu\_segment": "HIGH",  
  "filter\_data\_segment": "HEAVY", "filter\_current\_tariff": "tariff\_4;tariff\_8",  
  "target\_tariff": "tariff\_10", "channel": "sms"}

**Нәтиже қалай есептеледі.** Науқанның әсері — белгіленген сома емес, нақты абоненттің ARPU-інен алынатын **пайыз**: бір ғана ауысу қымбат абонентте көбірек табыс әкеледі.

Таза нәтиже \= ARPU өсімі (бірегей абоненттер бойынша)  
           	− Коммуникация шығындары (байланыстар × арна құны)

Егер ештеңе жасамаса, аудитория **150 641 084** әкеледі (predicted\_arpu бағанының сомасы). Таза нәтижесі жоғары болған жеңеді. Есепке **пилоттар да, қорытынды науқандар да** кіреді — пилоттық байланыстар да нақты.

| Арна | Байланыс құны | Тиімділік |
| :---- | :---- | :---- |
| push | тегін | төмен (×0.50) |
| sms | 4 ш.б. | орташа (×0.65) |
| digital\_ads | 22 ш.б. | орташадан жоғары (×0.85) |
| call | 160 ш.б. | жоғары (×1.20) |

## **6\. Деректер**

Барлығы қатысушы пакетінде. Деректер синтетикалық (басындағы ескертпені қараңыз): \~23 мың абонент, кезең 2026 жыл, тарифтер tariff\_1…tariff\_21 деп белгіленген және қолданыстағы желіні көрсетпейді, сомалар — шартты бірліктерде.

| Файл | Ішінде не бар |
| :---- | :---- |
| customer\_profile.csv | **науқандар аудиториясы**: 23 441 абонент, ағымдағы тариф, сегменттер, мінез-құлық, predicted\_arpu |
| data/change\_tariff.csv | ARPU-дің дейінгі және кейінгі мәндері бар 14 824 тариф ауысуының тарихы |
| data/traffic.csv | айлар бойынша тұтыну (минуттар, SMS, трафик, құрылғы) |
| data/arpu\_monthly.csv | абоненттер бойынша айлық түсім |
| data/dict\_tariff.csv | 21 тарифтің параметрлері (бағасы, пакеттері) |
| tariff\_dictionary.csv, feature\_dictionary.csv | тарифтер мен барлық бағандардың сипаттамасы |

**customer\_profile.csv ішіндегі сегменттер:**

| Баған | Мәндер | Шегі |
| :---- | :---- | :---- |
| arpu\_segment | LOW / MID / HIGH | ARPU\_3m\_avg бойынша: \<1000, 1000–5000, \>5000 |
| data\_segment | NON\_USER / LITE / HEAVY | 0 МБ/ай, 0–2000, \>2000 |
| call\_segment | LOW / MEDIUM / HIGH | \<100 мин/ай, 100–400, \>400 |

Жиынтықта «A тарифі → B тарифі \= \+X ARPU» дайын кестесі жоқ — әйтпесе міндет бір бағанды сұрыптауға келіп тірелер еді. Әсерді бағалауды агент өзі құрады.

## **7\. Must have**

Мұнсыз шешім есептелмейді. Барлығы бір python local\_eval.py командасымен тексеріледі:

> > 1\.         **Agent класы мен act(env) әдісі бар agent.py файлы**, қатесіз іске қосылады. *Тексеру:* local\_eval.py жұмыс істеп, нәтижені шығарады.

> > 2\.         **Бар тарифтер мен арналары бар 1-ден 10-ға дейін дұрыс науқан.** *Тексеру:* шығыста «Кампания … отброшена» («Науқан … алынып тасталды») деген жолдар жоқ.

> > 3\.         **Агент пилоттарды пайдаланады** (env.run\_pilot) және тіркелген константаларға емес, олардың нәтижелеріне сүйенеді. *Тексеру:* шығыста Пилотов проведено \> 0 («Өткізілген пилоттар \> 0»), логика кодта көрінеді.

> > 4\.         **Агент бюджет, қамту және пилоттар саны бойынша лимиттерге сыяды.** *Тексеру:* іске қосу асып кетусіз аяқталады.

> > 5\.         **python make\_submission.py командасынан алынған submission.csv файлы.** *Тексеру:* файл бар және біздің іске қосуымызбен қайта шығарылады.

## **8\. Опционалды**

Артықшылық береді, бірақ тапсыруға кедергі келтірмейді:

> > •           **Белгісіздікті ескеру:** агент пилот бойынша орташа мәнді ғана емес, оның сенімділігін де бағалайды (150 клиенттегі пилот 30 клиенттегіге қарағанда дәлірек).

> > •           **Бейімделгіш барлау:** пилоттардың көлемі мен саны қатаң белгіленбеген, анықталған нәрсеге байланысты.

> > •           **Арнаны мағыналы таңдау:** барлығына бір арна емес, сегменттің құндылығына қарай.

> > •           **Тұрақтылық:** нәтиже сәтсіз пилоттар сериясында ыдырап кетпейді (python local\_eval.py \--runs 10 — таңба секірмеуі тиіс).

> > •           **Шешім қабылдау контурындағы LLM** — рұқсат етіледі және құпталады.

## **9\. Шектеулер**

**Лимиттер (бір мезгілде қолданылады):**

> > •           ең көбі **10 науқан**;

> > •           **бір науқанға ең көбі 5 000 абонент** (одан асқаны есептелмейді);

> > •           жиынтығында, пилоттықтарды қоса алғанда, ең көбі **15 000 байланыс**;

> > •           пилоттықтарды қоса алғанда, барлық байланыстарға **100 000 ш.б.** бюджет;

> > •           әрқайсысында 10–200 абоненттен, ең көбі **20 пилот**;

> > •           **әр абонент бір рет есептеледі** — ол үшін ең жақсы науқан бойынша. Сәтті науқанды қайталап, әсерді көбейту мүмкін емес, ал артық байланыстар бәрібір ақша тұрады.

**Болмайды:**

> > •           пилоттарды айналып өтіп, ортаның ішкі құрылымына қол сұғу (\_\_closure\_\_, gc, ұйымдастырушының файлдарын оқу және т.б.) — **нәтиже жойылады**, код автоматты түрде тексеріледі;

> > •           құпия деректерді хардкодтау: LLM кілтін os.environ\["OPENAI\_API\_KEY"\]\-дан алыңыз, төрешілік кезінде оны біз қоямыз.

**Міндетті түрде ескеру қажет:**

> > •           агент модельдің барлық шақыруларын қоса алғанда, **10 минуттан аспай** жұмыс істейді;

> > •           LLM API қатемен жауап беруі мүмкін — шақыруларды try/except\-ке орап, қосалқы логика қарастырыңыз. Агент құлап қалса, өткізілген пилоттар бәрібір есепке алынады, бірақ нәтиже теріс болады;

> > •           төрешілік кезіндегі әсерлер мок-ортадағыдан **басқа**: логиканы баптаңыз, мок-қа арналған константаларды емес.

## **10\. Артефактілер**

| Артефакт | Міндетті |
| :---- | :---- |
| agent.py | иә |
| submission.csv (make\_submission.py арқылы генерацияланады) | иә |
| requirements.txt | кітапханалар қажет болса |
| Тәсіл сипатталған README | жоқ, бірақ талдау кезінде көмектеседі |

**Тапсырар алдында өзіңізді тексеру:** python local\_eval.py (іске қосу \+ есеп), \--runs 10 (әртүрлі seed бойынша тұрақтылық), python make\_submission.py.

local\_eval.py нәтижені төрешілік кезіндегідей **сол кодпен**, бірақ мок-әсерлерде есептейді — ол болашақ балды емес, механика мен агенттің мінез-құлқын көрсетеді. Бастау үшін мысал — agent\_template.py (әдейі әлсіз, оны ұту қиын емес).

| Критерий | Нені бағалаймыз | Ұпай |
| :---- | :---- | :---- |
| Тапсырмаға сәйкестігі және жұмыс істеу қабілеті | Шешімнің қойылған тапсырмаға қаншалықты сәйкес келетіні және мәлімделген негізгі сценарийді іске асыруға мүмкіндік беретіні бағаланады. | 25 |
| Техникалық іске асыру | Шешімнің техникалық іске асырылу сапасы бағаланады: таңдалған тәсіл, архитектура, компоненттердің өзара әрекеттесуі, AI/agentic AI және басқа технологияларды пайдалану. Нақты іске асырудың жобаның мәлімделген логикасына сәйкестігі ескеріледі. | 25 |
| README және қайта іске қосу мүмкіндігі | Құжаттаманың жоба құрылымын, пайдаланылған технологияларды, іске қосу тәртібін және негізгі жұмыс сценарийін түсінуге қаншалықты мүмкіндік беретіні бағаланады. Сондай-ақ репозиторий материалдары негізінде шешімді қайта іске қосу және тексеру мүмкіндігі ескеріледі. | 25 |
| Шешімнің құндылығы және қолданылуы | Шешімнің көрсетілген мәселені қаншалықты шешетіні бағаланады. Ұсынылған тәсілдің практикалық қолданылуы ескеріледі. | 15 |
| Даму әлеуеті және тәсілдің бірегейлігі | Шешімді одан әрі дамыту және оны кең ауқымда қолдану әлеуеті, сондай-ақ тапсырманы іске асырудағы негізделген стандарттан тыс немесе бірегей тәсілдердің болуы бағаланады. | 10 |
| Барлығы | — | 100 |

 

 

# **EN**

# **Beeline Tariff Marketing Campaigns Case**

### **Brief for Hackathon Participants**

**23,441 subscribers. 100,000 c.u. budget. 20 pilots. 9 hours.** Build an agent that decides whom to offer a tariff change — without bankrupting the company along the way.

⚠️ **All data and figures in this case were synthesized specifically for the hackathon.** This is not an export from Beeline systems and not the company's real metrics: volumes, tariffs, amounts, shares and effects were generated for a training task. Any conclusions about the operator's real business drawn from them are invalid.

## **1\. Name**

Agent for managing tariff marketing campaigns.

## **2\. Problem**

Beeline earns money from tariffs, and the key metric here is **ARPU** (average revenue per user). To grow it, the company constantly runs marketing campaigns: it picks a subscriber segment, offers them a switch to another tariff, and delivers the offer through some communication channel.

The problem is that a "blind" campaign loses money. A significant share of tariff changes ends in **downsell** — after switching, the subscriber pays *less* than before; another share of switches changes nothing. So a noticeable share of contacts is money spent with no result or direct damage to revenue. The contact itself is not free either: the entire budget would cover calls to only 625 people out of 23 thousand.

The process is already data-driven today: segmentation by usage data, ML propensity models, testing hypotheses on history. But the decision on "which campaigns to launch and how to split the budget" is made manually by an analyst — it takes a long time, and some options simply don't get considered.

## **3\. User**

**Primary user:** a marketing analyst planning campaigns for the next month.

**Key scenario:** runs the agent on the current base → the agent explores the data on its own, tests hypotheses with pilot campaigns, and returns a ready plan: which campaigns, for which segments, through which channels, and how to spend the budget.

## **4\. Task**

Develop an **agent system** that selects marketing campaigns and outputs a plan of **at most 10 campaigns**. One campaign \= three decisions:

|   | Decision | Choose from |
| :---- | :---- | :---- |
| **Who** | subscriber segment | ARPU, data and call usage, current tariff |
| **What** | target tariff | any of the 21 |
| **How** | communication channel | push / SMS / ads / call |

**The main difficulty is incomplete information.** The provided history describes a *different* sample of subscribers, not the one the result is calculated on. How the target audience will behave is unknown in advance. The only way to find out is a **pilot** — run the campaign on a small sample and see.

But pilots lie: **a pilot on 30 customers will label a moderately profitable segment as unprofitable in roughly one case out of four**. On 200 customers — one in twenty-five, but it costs seven times more, from the same budget as the campaigns themselves. At the same time, a strategy without exploration earns **\~15 times less** than one that knows the true effects: exploration is the main source of the result.

## **5\. Input → Output**

**Input** — an environment object env passed to the act() method:

class Agent:  
 	def act(self, env) \-\> list\[dict\]:  
     	\# env.customer\_profile   — audience DataFrame (23,441 subscribers)  
     	\# env.tariffs, env.channels  
     	\# env.remaining\_budget, env.remaining\_contacts, env.pilots\_left  
     	\# env.run\_pilot(target\_tariff=..., channel=..., n\_customers=...,  
     	\#           	filter\_arpu\_segment=..., filter\_current\_tariff=...)  
     	\# env.pilot\_history  	— your pilots and their results  
     	return \[...\]   \# up to 10 campaigns

**Output** — a list of dictionaries. target\_tariff and channel are required, filters are optional (omitted \= no filtering):

{"campaign\_name": "Premium Upsell", "filter\_arpu\_segment": "HIGH",  
  "filter\_data\_segment": "HEAVY", "filter\_current\_tariff": "tariff\_4;tariff\_8",  
  "target\_tariff": "tariff\_10", "channel": "sms"}

**How the result is calculated.** A campaign's effect is a **percentage** of the specific subscriber's ARPU, not a fixed amount: the same switch earns more on an expensive subscriber.

Net result \= ARPU uplift (over unique subscribers)  
          	− Communication costs (contacts × channel cost)

If nothing is done, the audience brings in **150,641,084** (the sum of the predicted\_arpu column). The highest net result wins. **Both pilots and final campaigns** count — pilot contacts are real too.

| Channel | Cost per contact | Effectiveness |
| :---- | :---- | :---- |
| push | free | low (×0.50) |
| sms | 4 c.u. | medium (×0.65) |
| digital\_ads | 22 c.u. | above average (×0.85) |
| call | 160 c.u. | high (×1.20) |

## **6\. Data**

Everything is in the participant pack. The data is synthetic (see the disclaimer at the top): \~23 thousand subscribers, period 2026, tariffs are labeled tariff\_1…tariff\_21 and do not reflect the current lineup, amounts are in conventional units.

| File | Contents |
| :---- | :---- |
| customer\_profile.csv | **campaign audience**: 23,441 subscribers, current tariff, segments, behavior, predicted\_arpu |
| data/change\_tariff.csv | history of 14,824 tariff changes with ARPU before and after |
| data/traffic.csv | usage (minutes, SMS, traffic, device) by month |
| data/arpu\_monthly.csv | monthly revenue by subscriber |
| data/dict\_tariff.csv | parameters of the 21 tariffs (price, bundles) |
| tariff\_dictionary.csv, feature\_dictionary.csv | descriptions of tariffs and all columns |

**Segments in customer\_profile.csv:**

| Column | Values | Threshold |
| :---- | :---- | :---- |
| arpu\_segment | LOW / MID / HIGH | by ARPU\_3m\_avg: \<1000, 1000–5000, \>5000 |
| data\_segment | NON\_USER / LITE / HEAVY | 0 MB/month, 0–2000, \>2000 |
| call\_segment | LOW / MEDIUM / HIGH | \<100 min/month, 100–400, \>400 |

There is no ready-made "tariff A → tariff B \= \+X ARPU" table in the pack — otherwise the task would boil down to sorting one column. The agent builds its own effect estimate.

## **7\. Must have**

Without these, the solution does not count. Everything is checked with a single command, python local\_eval.py:

> > 1\.         **An agent.py file with an Agent class and an act(env) method** that runs without errors. *Check:* local\_eval.py completes and prints the result.

> > 2\.         **From 1 to 10 valid campaigns** with existing tariffs and channels. *Check:* the output contains no "Кампания … отброшена" ("Campaign … discarded") lines.

> > 3\.         **The agent uses pilots** (env.run\_pilot) and relies on their results rather than hardcoded constants. *Check:* the output shows Пилотов проведено \> 0 ("Pilots run \> 0"), and the logic is visible in the code.

> > 4\.         **The agent stays within the limits** on budget, reach and number of pilots. *Check:* the run finishes without exceeding them.

> > 5\.         **A submission.csv file** produced by python make\_submission.py. *Check:* the file exists and is reproduced by our run.

## **8\. Optional**

These give an advantage but do not block submission:

> > •           **Accounting for uncertainty:** the agent estimates not only the pilot mean but also its reliability (a pilot on 150 customers is more accurate than one on 30).

> > •           **Adaptive exploration:** the size and number of pilots depend on what has already been learned rather than being fixed.

> > •           **Meaningful channel choice** based on segment value, not one channel for everything.

> > •           **Robustness:** the result does not fall apart after an unlucky series of pilots (python local\_eval.py \--runs 10 — the sign should not flip).

> > •           **An LLM in the decision loop** — allowed and encouraged.

## **9\. Constraints**

**Limits (all apply at once):**

> > •           at most **10 campaigns**;

> > •           at most **5,000 subscribers per campaign** (anything above does not count);

> > •           at most **15,000 contacts** in total, including pilots;

> > •           a budget of **100,000 c.u.** for all contacts, including pilots;

> > •           at most **20 pilots**, with 10–200 subscribers each;

> > •           **each subscriber counts once** — for the best campaign for them. You cannot duplicate a successful campaign to multiply its effect, and extra contacts still cost money.

**Not allowed:**

> > •           getting into the environment's internals bypassing pilots (\_\_closure\_\_, gc, reading the organizers' files and the like) — **the result is voided**, and the code is checked automatically;

> > •           hardcoding secrets: take the LLM key from os.environ\["OPENAI\_API\_KEY"\]; we will supply it during judging.

**Must take into account:**

> > •           the agent runs for **no longer than 10 minutes**, including all model calls;

> > •           the LLM API may return an error — wrap calls in try/except and have fallback logic. If the agent crashes, the pilots already run still count, but the result will be negative;

> > •           the effects during judging are **different** from those in the mock environment: tune the logic, not constants for the mock.

## **10\. Deliverables**

| Deliverable | Required |
| :---- | :---- |
| agent.py | yes |
| submission.csv (generated by make\_submission.py) | yes |
| requirements.txt | if libraries are needed |
| README describing the approach | no, but it helps during review |

**Self-check before submitting:** python local\_eval.py (run \+ report), \--runs 10 (robustness across seeds), python make\_submission.py.

local\_eval.py calculates the result with **the same code** as in judging, but on mock effects — it shows the mechanics and the agent's behavior, not your future score. A starter example is agent\_template.py (deliberately weak and easy to beat).

| Criterion | What is evaluated | Points |
| :---- | :---- | :---- |
| Compliance with the task and functionality | The assessment considers how well the solution meets the assigned task and enables the main stated scenario to be implemented. | 25 |
| Technical implementation | The quality of the solution’s technical implementation is assessed, including the selected approach, architecture, interaction between components, and use of AI/agentic AI and other technologies. The consistency of the actual implementation with the stated project logic is taken into account. | 25 |
| README and reproducibility | The assessment considers whether the documentation makes it possible to understand the project structure, technologies used, launch procedure, and main operating scenario. The possibility of reproducing and checking the solution based on the repository materials is also taken into account. | 25 |
| Value and applicability of the solution | The assessment considers how well the solution addresses the stated problem. The practical applicability of the proposed approach is taken into account. | 15 |
| Development potential and originality of the approach | The assessment considers the potential for further development of the solution and its use at a broader scale, as well as the presence of well-founded unconventional or original approaches to implementing the task. | 10 |
| Total | — | 100 |

