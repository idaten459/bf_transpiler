# TinyBF ビジュアライザ

TinyBF で生成した Brainfuck を 1 ステップずつ確認できるビジュアライザを用意しました。プログラムカウンタ・データポインタ・テープの状態・出力などを確認しながら実行できます。

## 起動方法

```bash
python -m tinybf.visualizer path/to/program.tbf
```

主なオプション:

- `--input TEXT` – Brainfuck に与える入力文字列。
- `--brainfuck` – ソースを TinyBF ではなく生 Brainfuck として扱います。
- `--max-steps N` – ステップ上限（既定値 5,000,000）。
- `--tape-window W` – データポインタの左右に表示するセル数。
- `--history-limit N` – 履歴として保持するスナップショット数。

## コマンド一覧

REPL では次のコマンドが利用できます:

- `next [N]` – 1（または *N*）命令分ステップ実行。
- `run [N]` – ブレークポイントに到達するか *N* ステップ進むまで実行。
- `state` – 現在のスナップショットを表示。
- `history [N]` – 直近 *N* 個のスナップショットを表示。
- `break PC` – Brainfuck 命令インデックス *PC* にブレークポイント設定。
- `breaks` – ブレークポイント一覧。
- `clear [PC]` – 指定したブレークポイント、または省略時は全削除。
- `restart` – セッションを最初からやり直す。
- `quit` / `exit` – 終了。
- `help` – コマンドのヘルプを表示。

各スナップショットには、テープの一部、ポインタ位置、出力バッファ、そして現在の Brainfuck 命令が表示されます。ブレークポイントに到達すると自動的に実行が停止します。

## ステップ上限

無限ループを避けるため、インタープリタにステップ数の上限を設けています。上限に達すると `StepLimitExceeded` 例外が発生し、実行が中断されます。必要に応じて `--max-steps` で調整してください。

## 利用例

TinyBF のサンプルをステップ実行する例:

```bash
python -m tinybf.visualizer examples/sum_two_digits.tbf
```

Brainfuck を直接可視化する例:

```bash
python -m tinybf.visualizer hello.bf --brainfuck --tape-window 5
```

ブレークポイントを設定して実行:

```bash
(viz) break 42
(viz) run
```

命令インデックス 42 に達したところで停止し、`state` や `next` で詳細を確認できます。
