---
date: 2026-02-16
category: awscp
title: "Q. DDoS攻撃を防ぐのはshieldだと思ってたんだけど、WAFでもDDoS攻撃を防げるの？「"
publish: false
---

Q. DDoS攻撃を防ぐのはshieldだと思ってたんだけど、WAFでもDDoS攻撃を防げるの？「
AWS WAFはDDOS攻撃を防ぐためのウェブアプリケーションファイアウ
オールである
」

A. めちゃくちゃ良い疑問 👍
ここは ShieldとWAFの役割の違い を整理すると一瞬で理解できます。

対象：
	•	AWS Shield
	•	AWS WAF

⸻

🔷 まず結論

DDoSの「大規模な攻撃」対策は Shield
Webレベルの「悪意あるリクエスト」対策は WAF

つまり：

✔ Shield = ネットワークレベル防御
✔ WAF = アプリケーションレベル防御

⸻

🔷 図で全体像

攻撃者
   ↓
インターネット
   ↓
[ Shield ]
   ↓
[ WAF ]
   ↓
ALB / CloudFront
   ↓
アプリ


⸻

🔷 ① AWS Shieldとは？

役割：
	•	L3 / L4（ネットワーク層）
	•	SYN Flood
	•	UDP Flood
	•	大量トラフィック攻撃

図：

大量パケット攻撃
████████████████
        ↓
Shieldで吸収

👉 インフラ側の防御

※Shield Standardは自動付与

⸻

🔷 ② AWS WAFとは？

役割：
	•	L7（HTTPレベル）
	•	SQLインジェクション
	•	XSS
	•	悪意あるIPブロック
	•	レート制限

図：

HTTPリクエスト
GET /login?id=1 OR 1=1
        ↓
WAFがブロック

👉 Webアプリ防御

⸻

🔷 DDoSとWAFの関係

DDoSにも種類がある：

🔵 ボリューム型攻撃

→ Shield

🔴 HTTPフラッド攻撃

→ WAF（レート制限）

⸻

🔷 比較表

比較	Shield	WAF
レイヤー	L3/L4	L7
攻撃種類	大規模トラフィック	Web攻撃
自動付与	Standardあり	なし
ルール設定	不要	必要


⸻

🔷 試験的な判断ワード

問題文ワード	答え
大規模DDoS	Shield
SQLインジェクション	WAF
HTTPレベル攻撃	WAF
トラフィック急増	Shield


⸻

🔷 だから問題文は？

「AWS WAFはDDoS攻撃を防ぐためのWAFである」

👉 半分正解、半分誤解。

正確には：

WAFは HTTPレベルのDDoS（レート攻撃） を防げる。
でもインフラレベルの大規模DDoSはShield。

⸻

🔷 一言まとめ

ShieldはネットワークレベルのDDoS防御、WAFはWebアプリレベルの攻撃防御。両方で守るのがベスト。

⸻
