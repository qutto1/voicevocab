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

  // ---- Lv3（大学受験レベル）中心の場面 ----
  {
    id: "t013", type: "talk", title: "新製品の開発会議",
    lines: [
      { sp: "A", en: "Let me demonstrate the new feature.", ja: "新しい機能を実演させてください。" },
      { sp: "B", en: "It looks good. How will you evaluate the results?", ja: "よさそうですね。結果はどう評価しますか。" },
      { sp: "A", en: "We will keep testing to enhance the design.", ja: "設計を高めるためにテストを続けます。" },
      { sp: "B", en: "Do we have sufficient time before the launch?", ja: "発売までに十分な時間はありますか。" },
      { sp: "A", en: "The biggest obstacle is the budget.", ja: "最大の障害は予算です。" },
    ],
    targets: [
      { en: "demonstrate", k: "w", line: 0 },
      { en: "evaluate", k: "w", line: 1 },
      { en: "enhance", k: "w", line: 2 },
      { en: "sufficient", k: "w", line: 3 },
      { en: "obstacle", k: "w", line: 4 },
    ],
  },
  {
    id: "t014", type: "talk", title: "仕事の引き継ぎ",
    lines: [
      { sp: "A", en: "I will take over your work while you are away.", ja: "留守の間、あなたの仕事を引き継ぎます。" },
      { sp: "B", en: "Thanks. It is only a temporary change.", ja: "ありがとう。一時的な変更にすぎないよ。" },
      { sp: "A", en: "I hope I can accomplish everything on time.", ja: "全部を期限までに成し遂げられるといいのですが。" },
      { sp: "B", en: "I anticipate some trouble with the schedule.", ja: "予定については多少の問題を予期しているよ。" },
      { sp: "A", en: "Yes, the delay is already apparent.", ja: "ええ、遅れはすでに明らかです。" },
    ],
    targets: [
      { en: "take over", k: "i", line: 0 },
      { en: "temporary", k: "w", line: 1 },
      { en: "accomplish", k: "w", line: 2 },
      { en: "anticipate", k: "w", line: 3 },
      { en: "apparent", k: "w", line: 4 },
    ],
  },
  {
    id: "t015", type: "talk", title: "価格の交渉",
    lines: [
      { sp: "A", en: "We need to negotiate the price again.", ja: "もう一度価格を交渉する必要があります。" },
      { sp: "B", en: "Can you account for the sudden increase?", ja: "急な値上がりを説明できますか。" },
      { sp: "A", en: "I don't want to exaggerate, but costs really rose.", ja: "大げさに言いたくはないですが、費用は本当に上がりました。" },
      { sp: "B", en: "Please give me accurate numbers.", ja: "正確な数字をください。" },
      { sp: "A", en: "If we can't agree, we may have to abandon the plan.", ja: "合意できなければ、計画を断念しなければならないかもしれません。" },
    ],
    targets: [
      { en: "negotiate", k: "w", line: 0 },
      { en: "account for", k: "i", line: 1 },
      { en: "exaggerate", k: "w", line: 2 },
      { en: "accurate", k: "w", line: 3 },
      { en: "abandon", k: "w", line: 4 },
    ],
  },
  {
    id: "t016", type: "talk", title: "英語学習の相談",
    lines: [
      { sp: "A", en: "How did you acquire such good pronunciation?", ja: "どうやってそんなにいい発音を習得したの？" },
      { sp: "B", en: "I imitate native speakers every day.", ja: "毎日ネイティブの真似をしているよ。" },
      { sp: "A", en: "I can't distinguish some sounds.", ja: "いくつかの音が聞き分けられないんだ。" },
      { sp: "B", en: "Don't worry. You won't fall behind if you keep going.", ja: "心配ないよ。続けていれば遅れを取ることはない。" },
      { sp: "A", en: "I hope it works out.", ja: "うまくいくといいな。" },
    ],
    targets: [
      { en: "acquire", k: "w", line: 0 },
      { en: "imitate", k: "w", line: 1 },
      { en: "distinguish", k: "w", line: 2 },
      { en: "fall behind", k: "i", line: 3 },
      { en: "work out", k: "i", line: 4 },
    ],
  },
  {
    id: "t017", type: "talk", title: "街で偶然会う",
    lines: [
      { sp: "A", en: "I came across an old friend downtown.", ja: "街で昔の友達に偶然出会ったよ。" },
      { sp: "B", en: "Nice. Did you drop by the new cafe?", ja: "いいね。新しいカフェには立ち寄った？" },
      { sp: "A", en: "Yes. It turned out to be a great place.", ja: "うん。結局とてもいい店だったよ。" },
      { sp: "B", en: "They transformed an old bank into a cafe.", ja: "古い銀行をカフェに変えたんだよね。" },
      { sp: "A", en: "But they prohibit talking on the phone inside.", ja: "でも店内での電話は禁止しているよ。" },
    ],
    targets: [
      { en: "come across", k: "i", line: 0 },
      { en: "drop by", k: "i", line: 1 },
      { en: "turn out", k: "i", line: 2 },
      { en: "transform", k: "w", line: 3 },
      { en: "prohibit", k: "w", line: 4 },
    ],
  },
  {
    id: "t018", type: "talk", title: "研究の発表",
    lines: [
      { sp: "A", en: "What is your hypothesis?", ja: "あなたの仮説は何ですか。" },
      { sp: "B", en: "I emphasize that small changes bring about big results.", ja: "小さな変化が大きな結果をもたらすことを強調します。" },
      { sp: "A", en: "How will you eliminate other factors?", ja: "他の要因はどうやって取り除きますか。" },
      { sp: "B", en: "By careful testing. I hope the data lives up to my expectations.", ja: "慎重な実験によってです。データが期待に応えるといいのですが。" },
    ],
    targets: [
      { en: "hypothesis", k: "w", line: 0 },
      { en: "emphasize", k: "w", line: 1 },
      { en: "bring about", k: "i", line: 1 },
      { en: "eliminate", k: "w", line: 2 },
      { en: "live up to", k: "i", line: 3 },
    ],
  },

  // ---- Lv4（上級レベル）中心の場面 ----
  {
    id: "t019", type: "talk", title: "古い規則の見直し",
    lines: [
      { sp: "A", en: "Some people want to abolish this old rule.", ja: "この古い規則を廃止したい人もいます。" },
      { sp: "B", en: "Is that a legitimate reason?", ja: "それは正当な理由ですか。" },
      { sp: "A", en: "The wording is ambiguous, so no one understands it.", ja: "文言があいまいで、誰も理解できないのです。" },
      { sp: "B", en: "If we implement a new rule, we need adequate time.", ja: "新しい規則を実施するなら、十分な時間が必要です。" },
    ],
    targets: [
      { en: "abolish", k: "w", line: 0 },
      { en: "legitimate", k: "w", line: 1 },
      { en: "ambiguous", k: "w", line: 2 },
      { en: "implement", k: "w", line: 3 },
      { en: "adequate", k: "w", line: 3 },
    ],
  },
  {
    id: "t020", type: "talk", title: "計画の弱点を指摘する",
    lines: [
      { sp: "A", en: "Your plan sounds plausible, but the details are vague.", ja: "あなたの計画はもっともらしく聞こえますが、詳細があいまいです。" },
      { sp: "B", en: "Which part?", ja: "どの部分ですか。" },
      { sp: "A", en: "These two numbers contradict each other.", ja: "この二つの数字は互いに矛盾しています。" },
      { sp: "B", en: "That could undermine the whole project.", ja: "それは計画全体を損ないかねません。" },
      { sp: "A", en: "Some changes are inevitable.", ja: "いくらかの変更は避けられません。" },
    ],
    targets: [
      { en: "plausible", k: "w", line: 0 },
      { en: "vague", k: "w", line: 0 },
      { en: "contradict", k: "w", line: 2 },
      { en: "undermine", k: "w", line: 3 },
      { en: "inevitable", k: "w", line: 4 },
    ],
  },
  {
    id: "t021", type: "talk", title: "災害からの復旧",
    lines: [
      { sp: "A", en: "The storm devastated the village.", ja: "嵐がその村を壊滅させました。" },
      { sp: "B", en: "Did any building withstand the wind?", ja: "風に耐えた建物はありましたか。" },
      { sp: "A", en: "Only the new hall. Clean water is indispensable now.", ja: "新しい会館だけです。今はきれいな水が不可欠です。" },
      { sp: "B", en: "The city will compensate the families.", ja: "市が住民に補償するそうです。" },
      { sp: "A", en: "Volunteers facilitate the recovery.", ja: "ボランティアが復旧を促進しています。" },
    ],
    targets: [
      { en: "devastate", k: "w", line: 0 },
      { en: "withstand", k: "w", line: 1 },
      { en: "indispensable", k: "w", line: 2 },
      { en: "compensate", k: "w", line: 3 },
      { en: "facilitate", k: "w", line: 4 },
    ],
  },
  {
    id: "t022", type: "talk", title: "売上の見直し",
    lines: [
      { sp: "A", en: "Prices fluctuate every month.", ja: "価格は毎月変動します。" },
      { sp: "B", en: "Does that imply a bigger problem?", ja: "それはもっと大きな問題を示唆していますか。" },
      { sp: "A", en: "Our profit has diminished.", ja: "利益は減少しました。" },
      { sp: "B", en: "We need a comprehensive review.", ja: "包括的な見直しが必要です。" },
      { sp: "A", en: "We derive most of our income from one product.", ja: "収入の大半を一つの製品から得ています。" },
    ],
    targets: [
      { en: "fluctuate", k: "w", line: 0 },
      { en: "imply", k: "w", line: 1 },
      { en: "diminish", k: "w", line: 2 },
      { en: "comprehensive", k: "w", line: 3 },
      { en: "derive", k: "w", line: 4 },
    ],
  },
  {
    id: "t023", type: "talk", title: "会議で意見を言う",
    lines: [
      { sp: "A", en: "Was that a deliberate mistake?", ja: "あれは意図的な間違いでしたか。" },
      { sp: "B", en: "No, but he tried to manipulate the data.", ja: "いいえ、しかし彼はデータを操作しようとしました。" },
      { sp: "A", en: "Fear can inhibit honest reporting.", ja: "恐れは正直な報告を妨げることがあります。" },
      { sp: "B", en: "If the problem persists, we must speak up.", ja: "問題が続くなら、声を上げるべきです。" },
      { sp: "A", en: "Don't hold back your opinion.", ja: "意見を控えないでください。" },
    ],
    targets: [
      { en: "deliberate", k: "w", line: 0 },
      { en: "manipulate", k: "w", line: 1 },
      { en: "inhibit", k: "w", line: 2 },
      { en: "persist", k: "w", line: 3 },
      { en: "hold back", k: "i", line: 4 },
    ],
  },
  {
    id: "t024", type: "talk", title: "候補を絞り込む",
    lines: [
      { sp: "A", en: "We can rule out the first plan.", ja: "最初の案は除外できます。" },
      { sp: "B", en: "I can't make out what this note says.", ja: "このメモに何と書いてあるか判読できません。" },
      { sp: "A", en: "What does this abbreviation stand for?", ja: "この略語は何を表していますか。" },
      { sp: "B", en: "Let's do away with these confusing labels.", ja: "この紛らわしい表示は廃止しましょう。" },
    ],
    targets: [
      { en: "rule out", k: "i", line: 0 },
      { en: "make out", k: "i", line: 1 },
      { en: "stand for", k: "i", line: 2 },
      { en: "do away with", k: "i", line: 3 },
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
    id: "n2026-07-22-03", type: "news", title: "全固体電池の弱点を解明",
    source: "https://www.sciencedaily.com/", fetchedAt: "2026-07-22",
    lines: [
      { en: "Researchers explained how soft lithium cracks the hard ceramic inside batteries.", ja: "研究者は、柔らかいリチウムが電池内部の硬いセラミックをどう割るのかを説明した。" },
      { en: "The cracks bring about short circuits and sudden failure.", ja: "その亀裂は短絡と突然の故障をもたらす。" },
      { en: "The team hopes to eliminate the problem with a new coating.", ja: "チームは新しい被膜でその問題を取り除きたいと考えている。" },
      { en: "Their hypothesis turned out to be correct in the first tests.", ja: "彼らの仮説は最初の試験で正しいと判明した。" },
      { en: "Makers cannot exaggerate the safety of these batteries yet.", ja: "製造各社はまだこれらの電池の安全性を誇張することはできない。" },
    ],
    targets: [
      { en: "bring about", k: "i", line: 1 },
      { en: "eliminate", k: "w", line: 2 },
      { en: "hypothesis", k: "w", line: 3 },
      { en: "turn out", k: "i", line: 3 },
      { en: "exaggerate", k: "w", line: 4 },
    ],
  },
  {
    id: "n2026-07-22-04", type: "news", title: "光の新しい構造を発見",
    source: "https://scitechdaily.com/", fetchedAt: "2026-07-22",
    lines: [
      { en: "Scientists in Singapore derive unusual light structures from an old optical effect.", ja: "シンガポールの科学者が、古い光学効果から珍しい光の構造を導き出している。" },
      { en: "The effect was first described about 200 years ago.", ja: "その効果は約200年前に初めて記述された。" },
      { en: "Researchers can now manipulate light with great precision.", ja: "研究者は今や高い精度で光を操作できる。" },
      { en: "Early results were vague, but the pattern persists in every test.", ja: "初期の結果はあいまいだったが、その模様はどの試験でも持続している。" },
      { en: "The team cannot rule out uses in future communication systems.", ja: "チームは将来の通信システムでの利用を除外できないとしている。" },
    ],
    targets: [
      { en: "manipulate", k: "w", line: 2 },
      { en: "vague", k: "w", line: 3 },
      { en: "persist", k: "w", line: 3 },
      { en: "rule out", k: "i", line: 4 },
      { en: "derive", k: "w", line: 0 },
    ],
  },
  {
    id: "n2026-07-23-01", type: "news", title: "NASAが月・火星向け技術41件を選定",
    source: "https://www.nasa.gov/news-release/nasa-identifies-more-than-40-space-technologies-for-collaboration/", fetchedAt: "2026-07-23",
    lines: [
      { en: "NASA recently announced 41 new technology projects with private companies for future space missions.", ja: "NASAは最近、将来の宇宙ミッションに向けて民間企業と41件の新しい技術プロジェクトを発表した。" },
      { en: "The companies will build various tools to help astronauts live and work on the Moon and Mars.", ja: "各企業は、宇宙飛行士が月や火星で生活し働くのを助けるさまざまな道具を開発する。" },
      { en: "The purpose of many projects is to protect equipment from dust or to manage power in dark areas.", ja: "多くのプロジェクトの目的は、機材をちりから守ったり、暗い場所で電力を管理したりすることだ。" },
      { en: "Engineers hope these tools will solve problems before a rocket can take off on a long mission.", ja: "技術者たちは、ロケットが長い任務で離陸する前にこれらの道具が問題を解決してくれることを期待している。" },
      { en: "NASA will work with each team in its own labs over the next two years.", ja: "NASAは今後2年間、それぞれのチームと自社の研究施設で協力する予定だ。" },
    ],
    targets: [
      { en: "recently", k: "w", line: 0 },
      { en: "announce", k: "w", line: 0 },
      { en: "various", k: "w", line: 1 },
      { en: "purpose", k: "w", line: 2 },
      { en: "solve", k: "w", line: 3 },
      { en: "take off", k: "i", line: 3 },
    ],
  },
  {
    id: "n2026-07-23-02", type: "news", title: "カリーが現役初の殿堂展示",
    source: "https://www.nba.com/news/stephen-curry-honored-with-hall-of-fame-exhibit", fetchedAt: "2026-07-23",
    lines: [
      { en: "Stephen Curry will become the first active NBA player to get his own display at the Basketball Hall of Fame museum.", ja: "ステフィン・カリーは、バスケットボール殿堂という博物館に自分専用の展示コーナーを持つ初の現役NBA選手になる。" },
      { en: "The museum wants to recognize his influence on basketball while he is still playing.", ja: "その博物館は、彼がまだ現役でプレーしているうちに、バスケットボールへの影響力を称えたいと考えている。" },
      { en: "Many young fans look up to Curry for changing how the game is played from long range.", ja: "多くの若いファンは、遠くからのシュートで試合の在り方を変えたカリーを尊敬している。" },
      { en: "He said he is still good at practicing hard every single day.", ja: "彼は、今も毎日欠かさず熱心に練習するのが得意だと語った。" },
      { en: "Experts predict the exhibit will inspire young players for many years.", ja: "専門家は、この展示が今後何年も若い選手たちを奮い立たせるだろうと予想している。" },
    ],
    targets: [
      { en: "museum", k: "w", line: 0 },
      { en: "recognize", k: "w", line: 1 },
      { en: "influence", k: "w", line: 1 },
      { en: "look up to", k: "i", line: 2 },
      { en: "be good at", k: "i", line: 3 },
      { en: "predict", k: "w", line: 4 },
    ],
  },
  {
    id: "n2026-07-24-01", type: "news", title: "NASAが月着陸へ軌道上リハーサル",
    source: "https://www.nasa.gov/directorates/esdmd/artemis-campaign-development-division/human-landing-system-program/how-nasas-artemis-iii-lander-test-will-pave-way-for-moon-landings/", fetchedAt: "2026-07-24",
    lines: [
      { en: "NASA is preparing an important rehearsal in space before astronauts try to land on the Moon again in the Artemis III mission.", ja: "NASAは、アルテミスIII計画で宇宙飛行士が再び月面着陸に挑む前に、宇宙空間での重要なリハーサルを準備している。" },
      { en: "Four astronauts will fly the Orion capsule into orbit and go through practice dockings with two different landers.", ja: "4人の宇宙飛行士がオリオン宇宙船で軌道に上がり、2種類の異なる着陸船とのドッキング練習を行う。" },
      { en: "Engineers say this rehearsal is significant because it has never been attempted in quite this way before.", ja: "技術者たちは、これほどの形での試みはこれまでなかったため、このリハーサルは重要な意味を持つと述べている。" },
      { en: "The tests aim to create confidence that everything will work when Artemis III tries to land on the Moon in 2027.", ja: "この試験は、2027年にアルテミスIIIが月面着陸を試みる際にすべてがうまくいくという確信を生み出すことを目指している。" },
      { en: "Astronauts say the mission will give them valuable experience working with new spacecraft in orbit.", ja: "宇宙飛行士たちは、この任務によって軌道上で新しい宇宙船を扱う貴重な経験が得られると話している。" },
    ],
    targets: [
      { en: "important", k: "w", line: 0 },
      { en: "go through", k: "i", line: 1 },
      { en: "significant", k: "w", line: 2 },
      { en: "create", k: "w", line: 3 },
      { en: "experience", k: "w", line: 4 },
    ],
  },
  {
    id: "n2026-07-24-02", type: "news", title: "コモンウェルスゲームズ、グラスゴーで開幕",
    source: "https://en.wikipedia.org/wiki/2026_Commonwealth_Games", fetchedAt: "2026-07-24",
    lines: [
      { en: "The 2026 Commonwealth Games began in Glasgow, Scotland, and will continue until early August.", ja: "2026年コモンウェルスゲームズはスコットランドのグラスゴーで開幕し、8月上旬まで続く。" },
      { en: "About three thousand athletes from more than seventy nations will compete in eleven sports.", ja: "70以上の国と地域からおよそ3000人の選手が11種目で競い合う。" },
      { en: "The opening ceremony took place in a bright arena called the Hydro on the first night.", ja: "開会式は初日の夜、ハイドロという名の明るいアリーナで行われた。" },
      { en: "Because Glasgow hosted the games before, organizers did not require many expensive new stadiums this time.", ja: "グラスゴーは以前にも大会を開催したことがあるため、今回は高額な新しいスタジアムをあまり必要としなかった。" },
      { en: "City leaders hope the event will provide a big boost to local business and tourism.", ja: "市の指導者たちは、この大会が地元の商業と観光に大きな後押しを与えることを期待している。" },
    ],
    targets: [
      { en: "continue", k: "w", line: 0 },
      { en: "bright", k: "w", line: 2 },
      { en: "require", k: "w", line: 3 },
      { en: "expensive", k: "w", line: 3 },
      { en: "provide", k: "w", line: 4 },
    ],
  },
];
