// message: 行動の間のメッセージ(相互接続ビューと同じ記号。GR7 P1 の裁定 Q8)
package P {
    attribute def Ping;
    action def Talk {
        action caller;
        action callee;
        message of Ping from caller to callee;
    }
}
