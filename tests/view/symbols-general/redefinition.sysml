// redefinition: 再定義
package Fleet {
    part def Vehicle {
        part engine;
    }
    part def Car :> Vehicle {
        part sportEngine :>> engine;
    }
}
