[33mcommit 10317f57d09a1c8fc21a9bd438dea93b101affda[m[33m ([m[1;36mHEAD[m[33m -> [m[1;32mmain[m[33m, [m[1;31morigin/main[m[33m, [m[1;31morigin/HEAD[m[33m)[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Tue May 5 00:23:34 2026 +0300

    adaugat componente pagina principala

[33mcommit 289e8853ec46d77f215cdaead190a6348d17a582[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Mon May 4 17:46:03 2026 +0300

    feat: frontend/THE REMAKE - am adaugat o structura mai clean + modificare partea layout si globals

[33mcommit a0e91eaa37f540c47b7f7ad53caac0b7e28cd720[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Mon May 4 17:44:26 2026 +0300

    am facut agentul sa populeze continuu, la fiecare 4 secunde

[33mcommit 354bcdcf88be39111f7fdf624d214746d5701b48[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Mon May 4 17:43:16 2026 +0300

    modificare TIMESTAMP to show the correct time

[33mcommit 275ee3de8bd3e43dd4b380bb790249ed6cbc2ee8[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Mon May 4 17:42:18 2026 +0300

    modificari eipiai - adaugare endpoint pentru procedura Heatmap-ului

[33mcommit 74286b7e20d13e4fb550331f60aafccd4c84094e[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Mon May 4 16:07:14 2026 +0300

    adaugat procedura pentru Heatmap

[33mcommit ce854b6390a280b19d403f89a4b0b60bc001d698[m
Merge: 387de5e d9d0d4b
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Thu Apr 30 20:23:27 2026 +0300

    Merge branch 'main' of https://github.com/mpaul2101/Watchdogs__
    miau

[33mcommit 387de5e37bfcab4c6bec57d2537fbac89faa0749[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Thu Apr 30 20:16:44 2026 +0300

    Update eipiai

[33mcommit 311f8aa5ec45223e45038318bfdbb526d1980e75[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Thu Apr 30 20:14:30 2026 +0300

    feat/smecherie-simulator-de-servere

[33mcommit d9d0d4b7d0bcbb5f05b5dedb1b7e71339f4992db[m
Merge: 6ec58c4 623b379
Author: Martin Paul <156363954+mpaul2101@users.noreply.github.com>
Date:   Thu Apr 30 19:35:11 2026 +0300

    Merge pull request from mpaul2101/feature/incident-routing
    
    Update backend API

[33mcommit 623b37983c9754d5cf339bba47ed0988c10a5445[m[33m ([m[1;31morigin/feature/incident-routing[m[33m, [m[1;32mfeature/incident-routing[m[33m)[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Thu Apr 30 19:34:01 2026 +0300

    Update backend API

[33mcommit 6ec58c4c3f4de603bb7e45ab89e9905fd2eece05[m
Merge: ca24888 e0594f5
Author: Martin Paul <156363954+mpaul2101@users.noreply.github.com>
Date:   Tue Apr 28 02:41:34 2026 +0300

    Merge pull request from mpaul2101/feature/incident-routing
    
    Feature/incident routing

[33mcommit e0594f54bdc7ac066271af4dc4be58d42546497e[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Tue Apr 28 02:08:37 2026 +0300

    feat: endpoints PATCH /api/incidents/{id} si GET /api/teams
    
    PATCH permite reassign manual (assigned_team, assigned_to) si update
    de status. Validare server-side pentru echipe (din ROUTING) si
    statusuri (OPEN, IN_PROGRESS, RESOLVED, CLOSED). Returneaza 404
    pentru id inexistent, 400 pentru valori invalide.
    
    GET /api/teams returneaza lista echipelor disponibile pentru
    populare dropdown-uri in UI.

[33mcommit adc0d34764b6a1e02728d950716b4913baf883f0[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Tue Apr 28 02:05:27 2026 +0300

    test: verifica routing-ul echipelor pentru fiecare metric_type
    
    Acopera RAM/DISK -> Infrastructure, HTTP_5XX -> Backend,
    DB_CONN_POOL -> Database.

[33mcommit 1e7bad5985ff921f3b5f10627a19978f9c2b2b38[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Tue Apr 28 02:05:20 2026 +0300

    feat: auto-routing al incidentelor catre echipe
    
    Tabela declarativa ROUTING mapeaza metric_type -> echipa
    (Infrastructure, Backend, Database, Security). La creare incident,
    _create_incident seteaza assigned_team conform mapping-ului.
    
    Pastram assigned_to liber pentru reassign manual catre un inginer
    specific din UI.

[33mcommit f1a20804ea08759c00ecbde9c7ff18f1922ba00f[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Tue Apr 28 02:05:13 2026 +0300

    db: adaugat coloana assigned_team in incidents
    
    Echipa responsabila pentru rezolvarea incidentului. Se completeaza
    automat la creare (vezi ROUTING in threshold_engine), iar UI-ul
    poate face reassign manual ulterior. Coloana assigned_to existenta
    ramane pentru atribuire individuala in cadrul echipei.

[33mcommit ca24888a8617cce36aa62936bb07f5ea8f50980f[m
Merge: fa2e0c6 a16e414
Author: Martin Paul <156363954+mpaul2101@users.noreply.github.com>
Date:   Tue Apr 28 01:52:41 2026 +0300

    Merge pull request from mpaul2101/feature/threshold-engine
    
    Feature/threshold engine

[33mcommit a16e41457417a56c178a25b6e904d246b3d44735[m[33m ([m[1;31morigin/feature/threshold-engine[m[33m, [m[1;32mfeature/threshold-engine[m[33m)[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Tue Apr 28 01:46:36 2026 +0300

    test: scenarii pentru threshold_engine (instant, sustained, dedup)
    
    6 teste care acopera:
    - instant CRITIC -> incident + alarma
    - deduplicare la severitate egala (sustained, fara spam)
    - escaladare cand severitatea creste (MEDIUM -> CRITIC)
    - valori sub praguri -> nimic
    - regula sustinuta nu declanseaza fara fereastra acoperita
    - un singur dip in fereastra blocheaza declansarea
    
    Foloseste server_id-uri cu prefix TEST- si curata datele la final.

[33mcommit 83783f8fff755f71965489e2d02dc287d2bfe2f4[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Tue Apr 28 01:46:25 2026 +0300

    feat: handler MQTT salveaza toate metricile si ruleaza motorul
    
    INSERT-ul include acum coloanele noi (RAM, disk + slot-urile pentru
    metrici aplicative). Dupa commit, apeleaza threshold_engine.evaluate()
    pe aceeasi conexiune ca sa emita alarme/incidente daca e cazul.
    
    Fix: timestamp-urile se construiesc UTC-naive (datetime.fromtimestamp
    cu tz=UTC apoi replace(tzinfo=None)). Anterior, datetime.fromtimestamp
    returna local time - cu containerul Postgres in UTC si gazda in EEST,
    diferenta de 3h facea ca interogarile pe fereastra de timp ale
    motorului sa nu gaseasca mostrele.

[33mcommit e042d3e6808447344e5869ae3efe7b5e9d7c22e8[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Tue Apr 28 01:46:13 2026 +0300

    feat: motor de evaluare a pragurilor pentru alarme si incidente
    
    Modul nou care implementeaza regulile din PDF (CPU/RAM/Disk/Response
    time/App-DB) cu evaluare instant si sustinuta. Pentru reguli sustinute
    verifica MIN(valoare) peste fereastra si ca avem date care acopera
    intervalul cerut (toleranta 10%).
    
    Logica de orchestrare:
    - pentru fiecare metric_type evalueaza in ordinea severitatii (CRITIC
      intai) si se opreste la prima regula indeplinita
    - deduplicare per (server_id, metric_type): doar un singur incident
      OPEN; alarmele repetate pe aceeasi severitate sunt silentioase
    - escaladare automata daca o severitate mai mare apare pe acelasi
      incident OPEN

[33mcommit ee494e29cb7aa29b9af7fa0fa3535976c7ee28b5[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Tue Apr 28 01:45:40 2026 +0300

    feat: agent trimite si RAM si disk pe langa CPU
    
    Foloseste psutil.virtual_memory si psutil.disk_usage pentru
    metricile noi. SERVER_ID extras intr-o constanta.

[33mcommit 9e50deb2e5a7a14ac5d447365f06298807604493[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Tue Apr 28 01:45:28 2026 +0300

    db: extins schema pentru disk, response time si app metrics
    
    Adaugat coloane in metrics (disk, response_time_ms, http_5xx_rate,
    db_conn_pct, auth_failures, traffic_users) si severity in alarms.
    Adaugat server_id, metric_type, updated_at in incidents pentru
    deduplicare. Indexuri pe (server_id, timestamp) si lookup-ul de
    incidente OPEN. Toate ALTER-urile sunt idempotente.

[33mcommit fa2e0c62f04436e455ae8f8529003946a7a68491[m
Merge: 7102fbd cbfe8dd
Author: Mustata Adrian Ionut <adrian.mustata05@e-uvt.ro>
Date:   Tue Apr 14 14:24:53 2026 +0300

    Merge pull request #2 from mpaul2101/frontend
    
    Metrics

[33mcommit cbfe8dd8b0427c06f5e1d29580923aad49d366a3[m[33m ([m[1;31morigin/frontend[m[33m)[m
Author: MustataAdrianIonut <adrian.mustata05@e-uvt.ro>
Date:   Tue Apr 14 13:59:20 2026 +0300

    Metrics display

[33mcommit 745646d8796bd88dd6139ad347bdb75cd2029f9f[m
Author: MustataAdrianIonut <adrian.mustata05@e-uvt.ro>
Date:   Tue Apr 14 12:38:37 2026 +0300

    Add React frontend and metrics view

[33mcommit 7102fbd66b0f53cbf0531ddc8caba3e3fd637ae4[m
Merge: dbc5159 c3da41a
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Mon Apr 13 19:53:35 2026 +0300

    Merge branch 'feature/becend-eipiai'

[33mcommit c3da41aa43ecc6d1051e7ea24a95db9df41ea332[m[33m ([m[1;32mfeature/becend-eipiai[m[33m)[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Mon Apr 13 19:53:15 2026 +0300

    feat: salvare date in DB si expunere prin API

[33mcommit dbc5159d782fb03d3877c7bb259973e6818bef1e[m
Author: Martin Paul <156363954+mpaul2101@users.noreply.github.com>
Date:   Mon Apr 13 19:10:55 2026 +0300

    feat: configurat tabelele de metrics, alarms si incidents

[33mcommit a9a892482d8c08295a2aee3ce02eef3165ea9ff2[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Mon Apr 13 19:06:57 2026 +0300

    feat: config tabele de metrics, alarms si incidents

[33mcommit 25dc663302a4d0a7df5308e1d2ce2847a02b9072[m[33m ([m[1;32mdb/alarms-and-incidents[m[33m)[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Mon Apr 13 18:53:53 2026 +0300

    feat: configurat tabelele de metrics, alarms si incidents

[33mcommit f0bf519b5acd37cd10dbda10e15ff716fd8c0a3d[m[33m ([m[1;31morigin/db/alarms-and-incidents[m[33m)[m
Author: danielnegriu <daniel.negriu05@e-uvt.ro>
Date:   Mon Apr 13 18:04:47 2026 +0300

    db: adaugat db schema pentru incidente si alarme

[33mcommit 9ad1b3fe92f6126d4996eff997ca6b2fc5fa1605[m
Merge: bf34b92 b8766c9
Author: dani <daniel.negriu05@e-uvt.ro>
Date:   Tue Apr 7 15:09:26 2026 +0300

    Merged agent paho-mqtt V2 API la main

[33mcommit b8766c9bd9160d78cf01614f6d33a751a0789328[m[33m ([m[1;31morigin/agent/update-mqtt-v2[m[33m)[m
Author: dani <daniel.negriu05@e-uvt.ro>
Date:   Mon Apr 6 22:00:15 2026 +0300

    Actualizat agent la paho-mqtt V2 API

[33mcommit bf34b92b0ce244aff018876c6ddb4f5ef248e682[m[33m ([m[1;31morigin/backend/conectare-mqtt-metrics-cpu[m[33m)[m
Author: dani <daniel.negriu05@e-uvt.ro>
Date:   Mon Apr 6 21:30:04 2026 +0300

    feat: Adaugat serviciu backend principal MQTT si handlere

[33mcommit ac629bc1ee7b282838180a80903fc48d31cd5908[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Sun Apr 5 20:43:08 2026 +0300

    feat: Adaugat agent python

[33mcommit d0310f7cd9e433eef19211f0dc202c3577a0a53c[m
Author: mpaul2101 <martinpaul2101@gmail.com>
Date:   Sun Apr 5 20:14:26 2026 +0300

    feat: Configurare Mosquitto si Docker

[33mcommit 4c242e565aaf2bc08f3d83080ae55fbf0b1e5234[m
Author: Martin Paul <156363954+mpaul2101@users.noreply.github.com>
Date:   Sun Apr 5 19:31:16 2026 +0300

    Initial commit
