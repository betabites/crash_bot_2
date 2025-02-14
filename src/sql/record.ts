import {type ISqlType} from "mssql"

export class Record {
    protected static _fieldDeclarations = {}
}

export function field(fieldName: string, type: ISqlType): PropertyDecorator {
    return function decorator(target: Object, propertyKey: string | symbol) {
        let value: any
        const getter = () => value
        const setter = (newValue: any) => {
            value = newValue
        }

        Object.defineProperty(target, propertyKey, {
            get: getter,
            set: setter,
            enumerable: true,
            configurable: true
        })
    }
}
