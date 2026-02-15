---
date: 2026-02-15
category: awscp
title: "Elastic IP"
publish: false
---

Elastic IP


この文は 「Elastic IPはタダじゃない」 という注意ポイントです。

対象：
Amazon Elastic Compute Cloud

⸻

🔷 まずElastic IPとは？

Elastic IP（EIP）＝
固定されたグローバルIPアドレス

通常のEC2は：

停止 → 起動
→ パブリックIPが変わる

Elastic IPを使うと：

停止 → 起動
→ IPが変わらない


⸻

🔷 基本構造

EC2
   ↑
Elastic IP（固定）
   ↑
インターネット


⸻

🔷 課金ルールの本質

Elastic IPは：
	•	AWSがグローバルIPを「確保」している状態
	•	IPv4は有限資源

だから：

✔ 無駄に確保していると課金
✔ 使っていなくても課金

⸻

🔷 状態別に整理

状態	課金
EC2に関連付けられている	課金対象
EC2停止中だが関連付け済み	課金対象
関連付けされていない	課金対象
使用中IPv4	基本的に有料（現在は特に）

※近年は「使用中でも有料」が原則

⸻

🔷 なぜ課金？

理由：

AWSがそのIPv4を
他の顧客に貸せない
＝ 機会損失

IPv4枯渇問題が背景。

⸻

🔷 図で理解

🔵 使っている状態

Elastic IP
   │
EC2（稼働）

→ IPを専有
→ 課金

⸻

🔴 使っていない状態

Elastic IP
   │
（どこにも未接続）

→ 無駄確保
→ 課金

⸻

🔷 試験的ポイント

問題で：

コスト削減したい
未使用IPがある

→ Elastic IP解放

⸻

🔷 よくある誤解

× EC2に付いていれば無料
→ ❌ 今は基本的に課金対象

⸻

🔷 1文まとめ

Elastic IPはAWSが固定IPv4を専有する仕組みのため、関連付けの有無に関わらず基本的に課金対象となる。

⸻
