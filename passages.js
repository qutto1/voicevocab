// VoiceVocab 例文集（場面）
//
// 1件 = ひとつの場面。lines に英日の対を持ち、targets にその場面から出題する語を持つ。
// 語の意味・品詞・発音記号・類義語・語源は words.js（辞書）側に持たせ、ここでは
// 「どの語が、どの行に出てくるか」だけを指定する。app.js が両者を突き合わせて出題用の
// 単語リストを組み立てる（例文はその語が現れる行がそのまま使われる）。
//
// type: "talk" = 会話（lines に sp: 話者ラベルを持つ）
//       "news" = ニュース（地の文のみ。実際の最新ニュースをもとに、事実から学習者向けの
//                英文を書き起こす。記事の文章はそのまま使わない。source/fetchedAt に出典と
//                取得日を残し、古くなったら差し替える）
//
// targets[].line は lines のインデックス。k は "w"=単語 / "i"=熟語（辞書の引き当てに使う）。

const PASSAGES = [
  // ================= 会話 =================
  {
    id: "t001", type: "talk", title: "旅行の計画",
    lines: [
      { sp: "A", en: "Where are you going on vacation this year?", ja: "今年の休暇はどこへ行くの？" },
      { sp: "B", en: "We decided to visit Okinawa in August.", ja: "8月に沖縄へ行くことにしたよ。" },
      { sp: "A", en: "Nice. How will you get there?", ja: "いいね。どうやって行くの？" },
      { sp: "B", en: "We found a cheap flight, so we arrive early in the morning.", ja: "安い便を見つけたから、朝早くに着くんだ。" },
      { sp: "A", en: "I'm looking forward to hearing about it.", ja: "話を聞くのが楽しみだな。" },
    ],
    targets: [
      { en: "vacation", k: "w", line: 0 },
      { en: "decide", k: "w", line: 1 },
      { en: "cheap", k: "w", line: 3 },
      { en: "arrive", k: "w", line: 3 },
      { en: "look forward to", k: "i", line: 4 },
    ],
  },
  {
    id: "t002", type: "talk", title: "体調をくずす",
    lines: [
      { sp: "A", en: "You look pale. Are you all right?", ja: "顔色が悪いね。大丈夫？" },
      { sp: "B", en: "I have a bad cold. I went to the hospital yesterday.", ja: "ひどい風邪なんだ。昨日病院に行ったよ。" },
      { sp: "A", en: "Please be careful and take care of yourself.", ja: "気をつけて、体を大事にしてね。" },
      { sp: "B", en: "Thanks. I'll stay home and keep quiet today.", ja: "ありがとう。今日は家で静かにしているよ。" },
      { sp: "A", en: "Get well soon. Being healthy is the most important thing.", ja: "早くよくなってね。健康であることが一番大事だよ。" },
    ],
    targets: [
      { en: "hospital", k: "w", line: 1 },
      { en: "careful", k: "w", line: 2 },
      { en: "take care of", k: "i", line: 2 },
      { en: "quiet", k: "w", line: 3 },
      { en: "healthy", k: "w", line: 4 },
    ],
  },
  {
    id: "t003", type: "talk", title: "仕事のオファーを断る",
    lines: [
      { sp: "A", en: "I heard you got a job offer from that company.", ja: "あの会社から仕事のオファーをもらったんだってね。" },
      { sp: "B", en: "Yes, but I decided to turn it down.", ja: "うん、でも断ることにしたんだ。" },
      { sp: "A", en: "Really? That sounds like a great opportunity.", ja: "ほんとに？ すごい好機だと思うけど。" },
      { sp: "B", en: "The pay was good, but I was reluctant to move so far away.", ja: "給料はよかったけど、そんなに遠くへ引っ越すのは気が進まなくてね。" },
      { sp: "A", en: "I see. That must have been a hard decision.", ja: "なるほど。それは難しい決断だったね。" },
      { sp: "B", en: "It was. But I don't regret it at all.", ja: "そうだね。でも全然後悔してないよ。" },
    ],
    targets: [
      { en: "offer", k: "w", line: 0 },
      { en: "turn down", k: "i", line: 1 },
      { en: "opportunity", k: "w", line: 2 },
      { en: "reluctant", k: "w", line: 3 },
      { en: "decision", k: "w", line: 4 },
      { en: "regret", k: "w", line: 5 },
    ],
  },
  {
    id: "t004", type: "talk", title: "引っ越しの準備",
    lines: [
      { sp: "A", en: "Have you prepared for the move next week?", ja: "来週の引っ越しの準備はできた？" },
      { sp: "B", en: "Not yet. I keep putting it off.", ja: "まだだよ。ずっと先延ばしにしている。" },
      { sp: "A", en: "You should get rid of the things you don't use.", ja: "使わない物は処分したほうがいいよ。" },
      { sp: "B", en: "You're right. This box is too heavy to carry alone.", ja: "たしかに。この箱は重すぎて一人では運べない。" },
    ],
    targets: [
      { en: "prepare", k: "w", line: 0 },
      { en: "put off", k: "i", line: 1 },
      { en: "get rid of", k: "i", line: 2 },
      { en: "heavy", k: "w", line: 3 },
      { en: "carry", k: "w", line: 3 },
    ],
  },
  {
    id: "t005", type: "talk", title: "勉強の悩み",
    lines: [
      { sp: "A", en: "English is too difficult for me. I want to give up.", ja: "英語は難しすぎる。あきらめたいよ。" },
      { sp: "B", en: "Don't say that. Your pronunciation has improved a lot.", ja: "そんなこと言わないで。発音はずいぶん上達したよ。" },
      { sp: "A", en: "Really? That encourages me.", ja: "ほんとに？ 励みになるな。" },
      { sp: "B", en: "Keep going, and you will succeed.", ja: "続けていれば、きっと成功するよ。" },
    ],
    targets: [
      { en: "difficult", k: "w", line: 0 },
      { en: "give up", k: "i", line: 0 },
      { en: "improve", k: "w", line: 1 },
      { en: "encourage", k: "w", line: 2 },
      { en: "succeed", k: "w", line: 3 },
    ],
  },
  {
    id: "t006", type: "talk", title: "朝の支度",
    lines: [
      { sp: "A", en: "You got up late again.", ja: "また起きるのが遅かったね。" },
      { sp: "B", en: "I know. I'm so hungry.", ja: "うん。すごくお腹がすいた。" },
      { sp: "A", en: "Breakfast is ready. Put on your jacket after you eat.", ja: "朝ごはんはできてるよ。食べたらジャケットを着てね。" },
      { sp: "B", en: "OK. Let's leave together.", ja: "わかった。一緒に出よう。" },
    ],
    targets: [
      { en: "get up", k: "i", line: 0 },
      { en: "hungry", k: "w", line: 1 },
      { en: "breakfast", k: "w", line: 2 },
      { en: "put on", k: "i", line: 2 },
      { en: "together", k: "w", line: 3 },
    ],
  },
  {
    id: "t007", type: "talk", title: "図書館で本を借りる",
    lines: [
      { sp: "A", en: "Can I borrow this book from the library?", ja: "この本を図書館で借りられますか。" },
      { sp: "B", en: "Yes, but I have a question about your card.", ja: "はい、ただカードについて質問があります。" },
      { sp: "A", en: "Sure. I hope I can answer it.", ja: "どうぞ。答えられるといいのですが。" },
      { sp: "B", en: "This author is famous, so the book is popular.", ja: "この著者は有名なので、この本は人気です。" },
    ],
    targets: [
      { en: "borrow", k: "w", line: 0 },
      { en: "library", k: "w", line: 0 },
      { en: "question", k: "w", line: 1 },
      { en: "answer", k: "w", line: 2 },
      { en: "famous", k: "w", line: 3 },
    ],
  },
  {
    id: "t008", type: "talk", title: "環境について話す",
    lines: [
      { sp: "A", en: "We should protect the environment for the future.", ja: "未来のために環境を守るべきだ。" },
      { sp: "B", en: "I agree. It is necessary to reduce plastic waste.", ja: "賛成。プラスチックごみを減らすことが必要だ。" },
      { sp: "A", en: "I try to avoid buying bottled water.", ja: "ペットボトルの水を買わないようにしている。" },
    ],
    targets: [
      { en: "protect", k: "w", line: 0 },
      { en: "environment", k: "w", line: 0 },
      { en: "necessary", k: "w", line: 1 },
      { en: "reduce", k: "w", line: 1 },
      { en: "avoid", k: "w", line: 2 },
    ],
  },
  {
    id: "t009", type: "talk", title: "新しい企画",
    lines: [
      { sp: "A", en: "I came up with a new idea for the project.", ja: "企画の新しい案を思いついたんだ。" },
      { sp: "B", en: "Tell me. I will consider it carefully.", ja: "教えて。じっくり検討するよ。" },
      { sp: "A", en: "I suggest we develop a simple app first.", ja: "まず簡単なアプリを開発することを提案するよ。" },
      { sp: "B", en: "Good. I will support you.", ja: "いいね。私が支援するよ。" },
    ],
    targets: [
      { en: "come up with", k: "i", line: 0 },
      { en: "consider", k: "w", line: 1 },
      { en: "suggest", k: "w", line: 2 },
      { en: "develop", k: "w", line: 2 },
      { en: "support", k: "w", line: 3 },
    ],
  },
  {
    id: "t010", type: "talk", title: "待ち合わせ",
    lines: [
      { sp: "A", en: "Can you pick me up at the station tomorrow?", ja: "明日、駅まで迎えに来てくれる？" },
      { sp: "B", en: "Sure. Don't forget your ticket this time.", ja: "いいよ。今度はチケットを忘れないでね。" },
      { sp: "A", en: "I remember. I put it in my bag.", ja: "覚えてる。かばんに入れたよ。" },
    ],
    targets: [
      { en: "pick up", k: "i", line: 0 },
      { en: "station", k: "w", line: 0 },
      { en: "tomorrow", k: "w", line: 0 },
      { en: "forget", k: "w", line: 1 },
      { en: "remember", k: "w", line: 2 },
    ],
  },
  {
    id: "t011", type: "talk", title: "試合が中止になる",
    lines: [
      { sp: "A", en: "They called off the game because of the weather.", ja: "天気のせいで試合が中止になった。" },
      { sp: "B", en: "That's too bad. It was dangerous to play yesterday.", ja: "それは残念。昨日はやるには危険だったね。" },
      { sp: "A", en: "Right. I will invite you to the next one.", ja: "そうだね。次の試合には誘うよ。" },
    ],
    targets: [
      { en: "call off", k: "i", line: 0 },
      { en: "weather", k: "w", line: 0 },
      { en: "dangerous", k: "w", line: 1 },
      { en: "yesterday", k: "w", line: 1 },
      { en: "invite", k: "w", line: 2 },
    ],
  },
  {
    id: "t012", type: "talk", title: "職場の人間関係",
    lines: [
      { sp: "A", en: "I can't get along with my new coworker.", ja: "新しい同僚とうまくやれないんだ。" },
      { sp: "B", en: "What happened?", ja: "何があったの？" },
      { sp: "A", en: "He gets angry easily, and his attitude is rude.", ja: "すぐ怒るし、態度が失礼なんだ。" },
      { sp: "B", en: "You should explain how you feel and deal with it calmly.", ja: "気持ちを説明して、落ち着いて対処したほうがいいよ。" },
    ],
    targets: [
      { en: "get along with", k: "i", line: 0 },
      { en: "angry", k: "w", line: 2 },
      { en: "attitude", k: "w", line: 2 },
      { en: "explain", k: "w", line: 3 },
      { en: "deal with", k: "i", line: 3 },
    ],
  },

  // ================= ニュース（最新情報から作成。毎日追加・差し替え） =================
  {
    id: "n2026-07-22-01", type: "news", title: "スペインがワールドカップ優勝",
    source: "https://www.britannica.com/topic/Major-Events-of-2026", fetchedAt: "2026-07-22",
    lines: [
      { en: "Spain defeated Argentina 1-0 in extra time and won the 2026 World Cup.", ja: "スペインが延長戦でアルゼンチンを1対0で破り、2026年ワールドカップで優勝した。" },
      { en: "According to the organizers, the number of visitors increased sharply this year.", ja: "主催者によると、今年は来場者数が大幅に増加した。" },
      { en: "Many fans said it was the most exciting final in years.", ja: "多くのファンが、ここ数年で最も面白い決勝だったと語った。" },
      { en: "The Spanish players were proud to achieve their goal after years of effort.", ja: "スペインの選手たちは、長年の努力の末に目標を達成できたことを誇りに思うと述べた。" },
    ],
    targets: [
      { en: "defeat", k: "w", line: 0 },
      { en: "according to", k: "i", line: 1 },
      { en: "increase", k: "w", line: 1 },
      { en: "proud", k: "w", line: 3 },
      { en: "achieve", k: "w", line: 3 },
      { en: "effort", k: "w", line: 3 },
    ],
  },
  {
    id: "n2026-07-22-02", type: "news", title: "テイラー・スウィフトが結婚",
    source: "https://www.britannica.com/topic/Major-Events-of-2026", fetchedAt: "2026-07-22",
    lines: [
      { en: "Taylor Swift and football player Travis Kelce got married in New York this month.", ja: "テイラー・スウィフトとアメフト選手のトラビス・ケルシーが今月ニューヨークで結婚した。" },
      { en: "About one thousand guests attended the ceremony at Madison Square Garden.", ja: "約1000人の招待客がマディソン・スクエア・ガーデンでの式に出席した。" },
      { en: "Reporters described the ceremony as simple and elegant.", ja: "記者たちはその式を簡素で上品だったと伝えた。" },
      { en: "Photos appeared online soon after, and many fans expressed their congratulations.", ja: "写真はその後すぐにネット上に現れ、多くのファンが祝福の言葉を寄せた。" },
      { en: "The couple received thousands of messages from around the world.", ja: "二人は世界中から何千ものメッセージを受け取った。" },
    ],
    targets: [
      { en: "describe", k: "w", line: 2 },
      { en: "appear", k: "w", line: 3 },
      { en: "express", k: "w", line: 3 },
      { en: "receive", k: "w", line: 4 },
    ],
  },
];
