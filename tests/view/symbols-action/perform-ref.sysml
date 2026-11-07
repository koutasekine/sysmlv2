// perform-ref: 行動の中の perform の行動、参照の行動、terminate
package P {
    action work;
    action def Job {
        first start;
        then perform work;
        then ref action other;
        then terminate;
    }
}
