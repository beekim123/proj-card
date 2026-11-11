#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#include <unistd.h>
#include <stdlib.h>
#include <string.h>
// Universal macOS 11+ helper. Metadata only; never reads display pixels.
// Godot macOS indexes NSScreen.screens. The launcher uses this live index;
// display.gd then verifies the native identity against DisplayServer geometry.
int main(int argc, char **argv) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
        NSArray<NSScreen *> *screens = [NSScreen screens];
        NSMutableArray *items = [NSMutableArray array];
        NSInteger builtin = -1; NSInteger builtinCount = 0;
        CGFloat maximumScale = 1.0;
        for (NSScreen *screen in screens) maximumScale = MAX(maximumScale, screen.backingScaleFactor);
        for (NSUInteger i = 0; i < screens.count; i++) {
            NSScreen *screen = screens[i];
            CGDirectDisplayID displayID = [screen.deviceDescription[@"NSScreenNumber"] unsignedIntValue];
            BOOL isBuiltin = CGDisplayIsBuiltin(displayID);
            if (isBuiltin) { builtin = (NSInteger)i; builtinCount++; }
            NSRect frame = screen.frame;
            [items addObject:@{@"index":@(i), @"display_id":@(displayID), @"builtin":@(isBuiltin),
                @"name":screen.localizedName ?: @"", @"scale":@(screen.backingScaleFactor),
                @"frame":@[@(frame.origin.x),@(frame.origin.y),@(frame.size.width),@(frame.size.height)],
                @"godot_size":@[@((NSInteger)(frame.size.width*maximumScale)),@((NSInteger)(frame.size.height*maximumScale))]}];
        }
        NSDictionary *result = @{@"builtin_index":@(builtin), @"builtin_count":@(builtinCount), @"screen_count":@(screens.count), @"max_scale":@(maximumScale), @"screens":items};
        NSString *executable = [NSString stringWithUTF8String:argv[0]];
        if ([executable.lastPathComponent isEqualToString:@"GemcardLauncher"]) {
            if (builtinCount != 1) { fputs("Cannot uniquely identify the built-in display.\n", stderr); return 2; }
            NSString *directory = executable.stringByDeletingLastPathComponent;
            NSDictionary *info = [NSDictionary dictionaryWithContentsOfFile:[directory.stringByDeletingLastPathComponent stringByAppendingPathComponent:@"Info.plist"]];
            NSString *engineName = info[@"GemcardEngineExecutable"];
            if (![engineName isKindOfClass:NSString.class] || [engineName containsString:@"/"]) return 2;
            NSString *engine = [directory stringByAppendingPathComponent:engineName];
            NSString *screenIndex = [NSString stringWithFormat:@"%ld", (long)builtin];
            setenv("GEMCARD_DISPLAY_PROBE", [[directory stringByAppendingPathComponent:@"display-probe"] UTF8String], 1);
            char **arguments = calloc((size_t)argc + 3, sizeof(char *));
            arguments[0] = (char *)engine.UTF8String;
            arguments[1] = "--screen";
            arguments[2] = (char *)screenIndex.UTF8String;
            for (int i = 1; i < argc; i++) arguments[i + 2] = argv[i];
            execv(engine.UTF8String, arguments);
            perror("Cannot start native Godot executable"); free(arguments); return 2;
        }
        if (argc > 1 && strcmp(argv[1], "--index") == 0) { printf("%ld\n", (long)builtin); return builtinCount == 1 ? 0 : 2; }
        NSData *json = [NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingSortedKeys error:nil];
        fwrite(json.bytes,1,json.length,stdout); fputc('\n',stdout);
        return builtinCount == 1 ? 0 : 2;
    }
}
