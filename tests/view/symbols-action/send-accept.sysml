// send-accept: accept・send・assign の箱(send・accept は左上の印)
package P {
    attribute def Sig;
    action def Talk {
        attribute n : Integer;
        first start;
        then accept s : Sig;
        then send new Sig() to self;
        then assign n := 1;
        then done;
    }
}
