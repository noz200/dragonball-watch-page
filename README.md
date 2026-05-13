<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dragon Ball 商品カレンダー</title>

  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.css">
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <header class="header">
    <div>
      <h1>Dragon Ball 商品カレンダー</h1>
      <p>予約・抽選・再販・締切の認知漏れ防止用。人生の予定表に悟空を混ぜないための専用ページです。</p>
    </div>
    <button id="reloadButton">再読み込み</button>
  </header>

  <main class="layout">
    <section class="panel">
      <div class="panelHeader">
        <h2>カレンダー</h2>
        <div id="summary"></div>
      </div>
      <div id="calendar"></div>
    </section>

    <aside class="side">
      <section class="panel">
        <h2>締切近い</h2>
        <div id="deadlineList" class="cardList"></div>
      </section>

      <section class="panel">
        <h2>受付中・要確認</h2>
        <div id="activeList" class="cardList"></div>
      </section>
    </aside>
  </main>

  <section class="panel full">
    <div class="panelHeader">
      <h2>全件一覧</h2>
      <div class="filters">
        <button data-filter="all" class="filter active">全件</button>
        <button data-filter="未確認" class="filter">未確認</button>
        <button data-filter="応募予定" class="filter">応募予定</button>
        <button data-filter="応募済み" class="filter">応募済み</button>
        <button data-filter="購入済み" class="filter">購入済み</button>
        <button data-filter="スルー" class="filter">スルー</button>
      </div>
    </div>
    <div id="allList" class="gridList"></div>
  </section>

  <dialog id="detailDialog">
    <div id="detailContent"></div>
    <button id="closeDialog">閉じる</button>
  </dialog>

  <script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js"></script>
  <script src="./app.js"></script>
</body>
</html>
