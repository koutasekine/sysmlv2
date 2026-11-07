// view-frame: ActionFlowView の view(図の枠)と注釈
package P {
    action def Flow {
        doc /* 手順 */
        first start;
        then action a;
        then done;
    }
    view v : ActionFlowView { expose Flow::**; }
}
