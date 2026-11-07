// if-else: if の箱。then の本体は図、else の本体は文字(action-body-textual)
package P {
    action def Check {
        attribute x : Integer;
        if x > 0 {
            action warn;
            then action log;
        } else {
            attribute y : Integer;
        }
    }
}
