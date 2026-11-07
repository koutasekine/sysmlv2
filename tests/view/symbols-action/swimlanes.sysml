// swimlanes: 部品ごとの列(perform-actions-swimlanes・swimlane。GR7 P1 の裁定 Q1〜Q3)
package P {
    part def Board;
    part def Led;
    part system {
        part board : Board {
            perform run.read;
        }
        part led : Led {
            perform run.blink;
        }
    }
    action run {
        action read;
        action blink;
        first start then read;
        first read then blink;
        first blink then done;
    }
}
