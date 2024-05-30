# Creating a Crash Bot module

## Prerequisites
This guide assumes you already have knowledge in the following areas:
- TypeScript
- JavaScript classes
- NodeJS

## Instructions

Crash Bot modules are class-based. This means that your module is represented as it's own class. This is to help make
each module self-contained and pluggable.

All Crash Bot modules need to:

1. Be located in the src/modules directory
2. Extend the 'BaseModules' class

```typescript
import { BaseModule } from "BaseModule.js" // The Base

class MyModule extends BaseModule {
    
}
```
