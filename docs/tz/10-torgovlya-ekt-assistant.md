# RU

**HACKALEM AI**

**Информационный пакет: кейсы ТОО «Электрокомплект» (ekt.kz)**

*Партнёр: ТОО «Электрокомплект» (ekt.kz).* 

# **Кейс. ИИ-ассистент для чата на сайте ekt.kz**

| 1\. Название | ИИ-ассистент-консультант и помощник для сайта ekt.kz |
| :---- | :---- |
| **2\. Проблема и ценность** | Сейчас клиенты сайта ekt.kz сталкиваются с тем, что для получения информации о продукте (технические характеристики, сертификаты), проверки наличия товара, поиска аналогов при отсутствии позиции и уточнения условий покупки им нужно писать или звонить менеджеру, из\-за чего решение о покупке затягивается, часть клиентов уходит к конкурентам, а менеджеры тратят время на однотипные вопросы вместо сложных сделок. **Ценность решения:** сокращение времени принятия решения о покупке, снижение оттока клиентов на этапе консультации и высвобождение времени менеджеров для сложных сделок и крупных клиентов. |
| **3\. Пользователь** | **Основной пользователь:** клиент интернет-магазина ekt.kz (частный покупатель или закупщик от компании), выбирающий электротехническую продукцию. **Ключевой сценарий:** заходит на сайт → открывает чат → спрашивает про товар, наличие, аналог или условия покупки → получает ответ и, при готовности, после явного подтверждения товар добавляется в корзину → переходит по ссылке на корзину для оформления заказа. |
| **4\. Задача** | Разработать ИИ-ассистента в едином окне чата на сайте, который консультирует по каталогу (информация о продукте, технические характеристики, сертификаты, наличие, аналоги, условия покупки) и, только после явного подтверждения клиента, добавляет выбранные позиции в корзину с учётом количества и остатков. |
| **5\. Вход → выход** | **Вход:** текстовый запрос клиента в чате (свободная формулировка), вложения — фото и файлы в форматах Excel, Word, PDF, JPEG (например, фото товара, спецификация, накладная), контекст диалога в рамках сессии, данные каталога и остатков. **Выход:** текстовый ответ в чате (информация о товаре / аналогах / условиях покупки); при подтверждении — обновлённая корзина и прямая ссылка на страницу корзины/оформления заказа. Допустимая задержка ответа — единицы секунд. |
| **6\. Данные (если задача на основе данных)** | **Ссылка/способ доступа:** выгрузка или тестовый API-доступ к каталогу и остаткам ekt.kz (образец предоставляется партнёром, точная дата полного набора — уточняется отдельно). **Поля и объём:** артикул, наименование, категория, ключевые характеристики, сертификаты (если есть, файл/ссылка), цена, остаток по складам, статус наличия; для прототипа достаточно репрезентативной выборки каталога. **Ограничения:** для разработки и демонстрации допустимо использовать анонимизированные или синтетические данные каталога с сохранением структуры полей. |
| **7\. Must have** | 1\) Отвечает на вопрос о наличии товара и предоставляет информацию о продукте — технические характеристики и сертификаты — используя данные каталога — проверка: тестовый запрос по существующему артикулу возвращает верные данные о наличии, тех. характеристики и, если сертификат есть в базе, ссылку/файл сертификата. 2\) При отсутствии товара предлагает релевантные аналоги — проверка: запрос по позиции с нулевым остатком возвращает минимум один аналог с кратким обоснованием. 3\) Отвечает на вопросы об условиях покупки (оплата, доставка, минимальная партия) — проверка: тестовый вопрос об условиях получает содержательный ответ. 4\) Добавляет товары в корзину только после явного подтверждения клиента, с учётом количества и наличия — проверка: без явного «да, добавь» изменений в корзине не происходит; после подтверждения количество не превышает остаток. 5\) Предоставляет прямую ссылку на корзину/оформление заказа после добавления — проверка: ссылка ведёт на актуальное состояние корзины. |
| **8\. Опционально** | Поддержка казахского языка; рекомендации сопутствующих товаров; сохранение истории диалога для авторизованных пользователей; эскалация сложных вопросов на менеджера. |
| **9\. Ограничения** | **Нельзя:** изменять состав корзины или оформлять заказ без явного подтверждения клиента; сообщать недостоверные данные о цене или наличии; запрашивать или хранить платёжные данные клиента. **Обязательно учесть:** приватность данных клиента, защиту от несанкционированного изменения корзины/заказа, объяснимость рекомендаций (почему предложен именно этот аналог), совместимость с текущей платформой сайта, поддержку десктопной и мобильной версии. |
| **10\. Артефакты** | Репозиторий: да. README: да (архитектура решения, инструкция запуска прототипа, описание используемых данных). |

# 

# KZ

**HACKALEM AI**

**Ақпараттық пакет: «Электрокомплект» ЖШС кейстері (ekt.kz)**

*Серіктес: «Электрокомплект» ЖШС (ekt.kz).*

# **Кейс. ekt.kz сайтындағы чатқа арналған ЖИ-ассистент**

| 1\. Атауы | ekt.kz сайтына арналған ЖИ-ассистент-кеңесші және көмекші |
| :---- | :---- |
| **2\. Мәселе және құндылығы** | Қазіргі уақытта ekt.kz сайтының клиенттері өнім туралы ақпарат алу (техникалық сипаттамалар, сертификаттар), тауардың бар-жоғын тексеру, позиция болмаған жағдайда аналогтарды іздеу және сатып алу шарттарын нақтылау үшін менеджерге жазуға немесе қоңырау шалуға мәжбүр. Соның салдарынан сатып алу туралы шешім кешігеді, клиенттердің бір бөлігі бәсекелестерге кетеді, ал менеджерлер күрделі мәмілелердің орнына біркелкі сұрақтарға уақыт жұмсайды. **Шешімнің құндылығы:** сатып алу туралы шешім қабылдау уақытын қысқарту, кеңес беру кезеңінде клиенттердің кетуін азайту және менеджерлердің уақытын күрделі мәмілелер мен ірі клиенттер үшін босату. |
| **3\. Пайдаланушы** | **Негізгі пайдаланушы:** электротехникалық өнімді таңдайтын ekt.kz интернет-дүкенінің клиенті (жеке сатып алушы немесе компания атынан сатып алушы). **Негізгі сценарий:** сайтқа кіреді → чатты ашады → тауар, оның бар-жоғы, аналогы немесе сатып алу шарттары туралы сұрайды → жауап алады және дайын болған кезде нақты растаудан кейін тауар себетке қосылады → тапсырысты рәсімдеу үшін себетке сілтеме арқылы өтеді. |
| **4\. Міндет** | Сайттағы бірыңғай чат терезесінде каталог бойынша кеңес беретін (өнім туралы ақпарат, техникалық сипаттамалар, сертификаттар, бар-жоғы, аналогтар, сатып алу шарттары) және тек клиент нақты растағаннан кейін ғана таңдалған позицияларды саны мен қалдықтарын ескере отырып себетке қосатын ЖИ-ассистент әзірлеу. |
| **5\. Кіріс → шығыс** | **Кіріс:** клиенттің чаттағы мәтіндік сұранысы (еркін тұжырым), тіркемелер — Excel, Word, PDF, JPEG форматындағы фотолар мен файлдар (мысалы, тауардың фотосы, спецификация, жүкқұжат), сессия шеңберіндегі диалог контексі, каталог пен қалдықтар деректері. **Шығыс:** чаттағы мәтіндік жауап (тауар / аналогтар / сатып алу шарттары туралы ақпарат); растаған жағдайда — жаңартылған себет және себет/тапсырысты рәсімдеу бетіне тікелей сілтеме. Жауаптың рұқсат етілген кідірісі — бірнеше секунд. |
| **6\. Деректер (егер міндет деректерге негізделсе)** | **Сілтеме/қол жеткізу тәсілі:** ekt.kz каталогы мен қалдықтарының үзіндісі немесе оларға тестілік API-қолжетімділік (үлгіні серіктес береді, толық жиынтықтың нақты күні бөлек нақтыланады). **Өрістер мен көлемі:** артикул, атауы, санаты, негізгі сипаттамалары, сертификаттар (болса, файл/сілтеме), бағасы, қоймалар бойынша қалдық, қолда бар болу мәртебесі; прототип үшін каталогтың репрезентативті іріктемесі жеткілікті. **Шектеулер:** әзірлеу және демонстрация үшін өрістер құрылымы сақталған анонимдендірілген немесе синтетикалық каталог деректерін пайдалануға жол беріледі. |
| **7\. Must have** | 1\) Каталог деректерін пайдалана отырып, тауардың бар-жоғы туралы сұраққа жауап береді және өнім туралы ақпаратты — техникалық сипаттамалар мен сертификаттарды — ұсынады — тексеру: бар артикул бойынша тестілік сұраныс бар-жоғы туралы дұрыс деректерді, техникалық сипаттамаларды және, егер сертификат базада болса, сертификатқа сілтемені/файлды қайтарады. 2\) Тауар болмаған жағдайда релевантты аналогтарды ұсынады — тексеру: қалдығы нөлге тең позиция бойынша сұраныс қысқаша негіздемесі бар кемінде бір аналогты қайтарады. 3\) Сатып алу шарттары (төлем, жеткізу, ең аз партия) туралы сұрақтарға жауап береді — тексеру: шарттар туралы тестілік сұраққа мазмұнды жауап беріледі. 4\) Тауарларды себетке тек клиент нақты растағаннан кейін ғана, саны мен бар-жоғын ескере отырып қосады — тексеру: нақты «иә, қос» деген растаусыз себетте өзгерістер болмайды; растағаннан кейін саны қалдықтан аспайды. 5\) Қосқаннан кейін себетке/тапсырысты рәсімдеуге тікелей сілтеме береді — тексеру: сілтеме себеттің өзекті күйіне апарады. |
| **8\. Опционалды** | Қазақ тілін қолдау; ілеспе тауарларды ұсыну; авторизацияланған пайдаланушылар үшін диалог тарихын сақтау; күрделі сұрақтарды менеджерге жіберу (эскалация). |
| **9\. Шектеулер** | **Болмайды:** клиенттің нақты растауынсыз себеттің құрамын өзгерту немесе тапсырыс рәсімдеу; баға немесе бар-жоғы туралы дұрыс емес деректерді хабарлау; клиенттің төлем деректерін сұрау немесе сақтау. **Міндетті түрде ескеру қажет:** клиент деректерінің құпиялылығы, себетті/тапсырысты рұқсатсыз өзгертуден қорғау, ұсынымдардың түсіндірмелілігі (неліктен дәл осы аналог ұсынылды), сайттың қазіргі платформасымен үйлесімділік, десктоп және мобильді нұсқаларды қолдау. |
| **10\. Артефактілер** | Репозиторий: иә. README: иә (шешім архитектурасы, прототипті іске қосу нұсқаулығы, пайдаланылатын деректердің сипаттамасы). |

#


# EN

**HACKALEM AI**

**Information Pack: Elektrokomplekt LLP Cases (ekt.kz)**

*Partner: Elektrokomplekt LLP (ekt.kz).*

# **Case. AI Assistant for the Chat on ekt.kz**

| 1\. Name | AI consultant and assistant for the ekt.kz website |
| :---- | :---- |
| **2\. Problem and Value** | Currently, to get product information (technical specifications, certificates), check stock availability, find alternatives when an item is unavailable, or clarify purchase terms, ekt.kz customers have to write to or call a manager. As a result, purchase decisions are delayed, some customers leave for competitors, and managers spend time on repetitive questions instead of complex deals. **Value of the solution:** shorter purchase decision time, less customer churn at the consultation stage, and more manager time freed up for complex deals and key accounts. |
| **3\. User** | **Primary user:** a customer of the ekt.kz online store (a private buyer or a corporate purchaser) choosing electrical products. **Key scenario:** visits the website → opens the chat → asks about a product, availability, an alternative or purchase terms → gets an answer and, when ready, after explicit confirmation the product is added to the cart → follows the cart link to place the order. |
| **4\. Task** | Develop an AI assistant in a single chat window on the website that advises on the catalog (product information, technical specifications, certificates, availability, alternatives, purchase terms) and, only after the customer's explicit confirmation, adds the selected items to the cart, taking quantity and stock levels into account. |
| **5\. Input → Output** | **Input:** the customer's text query in the chat (free-form wording), attachments — photos and files in Excel, Word, PDF and JPEG formats (e.g., a product photo, a specification, a delivery note), the dialogue context within the session, catalog and stock data. **Output:** a text reply in the chat (information about the product / alternatives / purchase terms); upon confirmation — an updated cart and a direct link to the cart/checkout page. Acceptable response latency is a few seconds. |
| **6\. Data (if the task is data-based)** | **Link/access method:** an export of, or test API access to, the ekt.kz catalog and stock levels (a sample is provided by the partner; the exact date of the full dataset will be confirmed separately). **Fields and volume:** SKU, product name, category, key specifications, certificates (if any, file/link), price, stock by warehouse, availability status; a representative sample of the catalog is sufficient for the prototype. **Constraints:** anonymized or synthetic catalog data that preserves the field structure may be used for development and demonstration. |
| **7\. Must have** | 1\) Answers questions about product availability and provides product information — technical specifications and certificates — using catalog data — verification: a test query for an existing SKU returns correct availability data, technical specifications and, if a certificate is in the database, a link to/file of the certificate. 2\) When a product is unavailable, suggests relevant alternatives — verification: a query for an item with zero stock returns at least one alternative with a brief rationale. 3\) Answers questions about purchase terms (payment, delivery, minimum order quantity) — verification: a test question about the terms receives a meaningful answer. 4\) Adds products to the cart only after the customer's explicit confirmation, taking quantity and availability into account — verification: without an explicit "yes, add it" the cart does not change; after confirmation the quantity does not exceed the stock level. 5\) Provides a direct link to the cart/checkout after adding items — verification: the link leads to the current state of the cart. |
| **8\. Optional** | Kazakh language support; recommendations of related products; saving dialogue history for logged-in users; escalating complex questions to a manager. |
| **9\. Constraints** | **Not allowed:** changing the cart contents or placing an order without the customer's explicit confirmation; providing inaccurate price or availability information; requesting or storing the customer's payment details. **Must take into account:** customer data privacy, protection against unauthorized changes to the cart/order, explainability of recommendations (why this particular alternative was suggested), compatibility with the website's current platform, support for desktop and mobile versions. |
| **10\. Deliverables** | Repository: yes. README: yes (solution architecture, prototype launch instructions, description of the data used). |

#  

