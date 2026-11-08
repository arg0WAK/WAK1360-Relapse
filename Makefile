SDK    := /opt/ps5-payload-sdk
CC     := $(SDK)/bin/prospero-clang
STRIP  := $(SDK)/bin/prospero-strip
TARGET := $(SDK)/target

CFLAGS  := -Os -Wall -ffunction-sections -fdata-sections -Iinclude -I$(TARGET)/include
LDFLAGS := -Wl,--gc-sections
LIBS    := lib/libmicrohttpd.a -L$(TARGET)/lib -lpthread \
           -lSceNetCtl -lSceUserService -lSceSystemService -lSceAppInstUtil

PAYLOAD_DIR  := install/payloads
ORCHESTRATOR := $(PAYLOAD_DIR)/orchestrator.elf

all: $(ORCHESTRATOR) sce-hell0.elf

sce-hell0.elf: main.c build/assets.inc assets/icon0.png lib/libmicrohttpd.a include/microhttpd.h
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ main.c $(LIBS)
	$(STRIP) $@

$(ORCHESTRATOR): orchestrator.c build/payloads.inc lib/libmicrohttpd.a include/microhttpd.h
	@mkdir -p $(PAYLOAD_DIR)
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ orchestrator.c $(LIBS)
	$(STRIP) $@

$(PAYLOAD_DIR):
	mkdir -p $@

build/payloads.inc: tools/gen_payloads.sh FORCE
	@mkdir -p build
	@sh tools/gen_payloads.sh > $@.tmp
	@if cmp -s $@.tmp $@; then rm -f $@.tmp; else mv $@.tmp $@; fi

build/assets.inc: tools/gen_assets.sh FORCE
	@mkdir -p build
	@sh tools/gen_assets.sh > $@.tmp
	@if cmp -s $@.tmp $@; then rm -f $@.tmp; else mv $@.tmp $@; fi

clean:
	rm -rf sce-hell0.elf $(PAYLOAD_DIR) build

FORCE:
.PHONY: all clean FORCE