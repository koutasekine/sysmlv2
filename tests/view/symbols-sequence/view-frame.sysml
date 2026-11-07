// view-frame: 型が SequenceView の view の枠、注釈と注釈の線、依存、描いていないメンバーの省略記号
package P {
    occurrence def Talk {
        part a {
            event occurrence e1;
        }
        part b {
            event occurrence e2;
        }
        part c;
        message hello from a.e1 to b.e2;
        comment note1 about a /* 送り手 */
        dependency dep from c to b;
        attribute hidden : Integer;
    }
    view talkView : SequenceView {
        expose Talk;
        expose Talk::a;
        expose Talk::b;
        expose Talk::c;
        expose Talk::hello;
        expose Talk::note1;
        expose Talk::dep;
    }
}
