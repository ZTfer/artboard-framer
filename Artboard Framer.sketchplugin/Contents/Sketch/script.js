@import "delegate.js";

var sketch = require("sketch");

// Plugin variables
var pluginName = "Artboard Framer",
	pluginDescription = "Frame your artboards with a device image or wireframe.",
	pluginIdentifier = "com.sonburn.sketchplugins.artboard-framer",
	frameLibraryID = "D16D094A-4631-43DB-A362-B9D66057F333",
	frameLibrary,
	frameGroup,
	debugMode = true;

var frameAll = function(context) {
	// Get artboards on current page
	var artboards = context.document.currentPage().artboards();

	// If artboards are present...
	if (artboards.count() > 0) {
		// Frame the artboards
		createFrames(context,artboards);

		if (!debugMode) googleAnalytics(context,"frameAll","run");
	}
	// If no artboards are present...
	else {
		// Display feedback
		displayDialog("There are no artboards on the page.",pluginName);
	}
}

var frameSelected = function(context) {
	// Filter selections for artboards
	var predicate = NSPredicate.predicateWithFormat("className == %@","MSArtboardGroup"),
		selection = context.selection.filteredArrayUsingPredicate(predicate);

	// If artboards are selected...
	if (selection.count() > 0) {
		// Frame the artboards
		createFrames(context,selection);

		if (!debugMode) googleAnalytics(context,"frameSelected","run");
	}
	// If no artboards are selected...
	else {
		// Display feedback
		displayDialog("Select at least one artboard.",pluginName);
	}
}

var report = function(context) {
	openUrl("https://github.com/sonburn/artboard-framer/issues/new");
	if (!debugMode) googleAnalytics(context,"report","report");
};

var donate = function(context) {
	openUrl("https://www.paypal.me/sonburn");
	if (!debugMode) googleAnalytics(context,"donate","donate");
};

function actionWithType(context,type) {
	var controller = context.document.actionsController();

	if (controller.actionWithName) {
		return controller.actionWithName(type);
	} else if (controller.actionWithID) {
		return controller.actionWithID(type);
	} else {
		return controller.actionForID(type);
	}
}

function createAlertWindow(context,name,text) {
	var alertWindow = COSAlertWindow.new();

	var iconPath = context.plugin.urlForResourceNamed("icon.png").path(),
		icon = NSImage.alloc().initByReferencingFile(iconPath);

	alertWindow.setIcon(icon);
	alertWindow.setMessageText(name);
	alertWindow.setInformativeText(text);

	return alertWindow;
}

function createFrames(context,artboards) {
	// Set the frame library
	frameLibrary = getFrameLibrary(context);

	// Get the frame settings
	var frameSettings = getFrameSettings(context),
		frameSymbol = frameSettings.frame;

	// If a frame has been selected...
	if (frameSymbol) {
		// Set the frame group
		frameGroup = getFrameGroup(context);

		// Artboard & frame variables
		var artboardLoop = artboards.objectEnumerator(),
			artboard,
			frameSymbol = importForeignSymbol(frameSymbol,frameLibrary).symbolMaster(),
			framesAdded = 0,
			framesUpdated = 0,
			framesRemoved = removeOrphans(context);

		// Iterate through the artboards...
		while (artboard = artboardLoop.nextObject()) {
			// Check for existing frame for the artboard
			var predicate = NSPredicate.predicateWithFormat("userInfo != nil && function(userInfo,'valueForKeyPath:',%@).linkedToArtboard == %@",pluginIdentifier,artboard.objectID()),
				artboardFrame = frameGroup.layers().filteredArrayUsingPredicate(predicate).firstObject();

			// If frame does not exist...
			if (!artboardFrame) {
				// Create new frame and determine where to insert
				var artboardFrame = frameSymbol.newSymbolInstance();

				// Link frame to artboard
				context.command.setValue_forKey_onLayer(artboard.objectID(),"linkedToArtboard",artboardFrame);

				// Insert frame into frame group
				frameGroup.insertLayer_atIndex(artboardFrame,null);

				// Increment the appropriate frame counter
				framesAdded++;
			}
			// If frame exists...
			else {
				// Change the existing frame
				artboardFrame.changeInstanceToSymbol(frameSymbol);

				// Resize the frame to the new master
				artboardFrame.resetSizeToMaster();

				// Update the name of the frame instance
				artboardFrame.setName(frameSymbol.name());

				// Increment the appropriate frame counter
				framesUpdated++;
			}
		}

		// Update all frame positions
		updateFrames(context,frameGroup);

		// If user wants a frame slice
		if (frameSettings.slice) {
			// Frame slice variables
			var predicate = NSPredicate.predicateWithFormat("userInfo != nil && function(userInfo,'valueForKeyPath:',%@).frameSlice == true",pluginIdentifier),
				frameSlice = context.document.currentPage().children().filteredArrayUsingPredicate(predicate).firstObject(),
				frameSlicePad = 200;

			// If frame slice does not exist...
			if (!frameSlice) {
				// Create the slice
				var sliceLayer = MSSliceLayer.new();
				sliceLayer.setName("Artboard Framer");

				// Designate the slice as the frameSlice
				context.command.setValue_forKey_onLayer(true,"frameSlice",sliceLayer);

				// Insert slice into frame group
				frameGroup.insertLayer_atIndex(sliceLayer,0);
			}

			// Set the frame slice location and dimensions
			sliceLayer.frame().setX(0 - frameSlicePad);
			sliceLayer.frame().setY(0 - frameSlicePad);
			sliceLayer.frame().setWidth(frameGroup.frame().width() + frameSlicePad * 2);
			sliceLayer.frame().setHeight(frameGroup.frame().height() + frameSlicePad * 2);

			// Resize the frame group
			if (sketch.version.sketch > 52) {
				frameGroup.fixGeometryWithOptions(0);
			} else {
				frameGroup.resizeToFitChildrenWithOption(0);
			}
		}

		// Display feedback
		context.document.showMessage((framesAdded + framesUpdated) + " artboards have been framed");
	}
}

function createCheckbox(item,state,frame) {
	var checkbox = NSButton.alloc().initWithFrame(frame),
		state = (state == false) ? NSOffState : NSOnState;

	checkbox.setButtonType(NSSwitchButton);
	checkbox.setBezelStyle(0);
	checkbox.setTitle(item.name);
	checkbox.setTag(item.value);
	checkbox.setState(state);

	return checkbox;
}

function createSelect(items,selected,frame) {
	var comboBox = NSComboBox.alloc().initWithFrame(frame),
		selected = (selected > -1) ? selected : 0;

	comboBox.addItemsWithObjectValues(items);
	comboBox.selectItemAtIndex(selected);
	comboBox.setNumberOfVisibleItems(16);
	comboBox.setCompletes(1);

	return comboBox;
}

function displayDialog(message,title) {
	NSApplication.sharedApplication().displayDialog_withTitle(message,title);
}

function getFrameGroup(context) {
	var predicate = NSPredicate.predicateWithFormat("userInfo != nil && function(userInfo,'valueForKeyPath:',%@).frameGroup == true",pluginIdentifier),
		frameGroup = context.document.currentPage().children().filteredArrayUsingPredicate(predicate).firstObject();

	if (!frameGroup) {
		var frameGroup = MSLayerGroup.new();

		frameGroup.setName("Frames");
		frameGroup.setHasClickThrough(true);
		frameGroup.frame().setX(0);
		frameGroup.frame().setY(0);

		context.command.setValue_forKey_onLayer(true,"frameGroup",frameGroup);

		context.document.currentPage().insertLayer_atIndex(frameGroup,0);
	}

	return frameGroup;
}

function getFrameLibrary(context) {
	// Get the frame library
	var predicate = NSPredicate.predicateWithFormat("libraryID == %@",frameLibraryID),
		frameLibrary = AppController.sharedInstance().librariesController().libraries().filteredArrayUsingPredicate(predicate).firstObject(),
		frameLibraryName = "Artboard Framer.sketch",
		frameLibraryPath = context.plugin.urlForResourceNamed(frameLibraryName).path();

	// If the frame library exists and it's disabled...
	if (frameLibrary && frameLibrary.enabled() == 0) {
		// Enable the frame library
		frameLibrary.setEnabled(1);
	}

	// If the frame library does not exist...
	if (!frameLibrary) {
		// Get file URL of frame library in plugin bundle
		var fileURLWithPath = NSURL.fileURLWithPath(frameLibraryPath);

		// Add the frame library to Sketch
		NSApp.delegate().librariesController().addAssetLibraryAtURL(fileURLWithPath);

		// Alert Sketch of library change
		AppController.sharedInstance().librariesController().notifyLibraryChange(null);

		// Display feedback
		context.document.showMessage("Artboard Framer library installed");

		// Get the frame library
		frameLibrary = AppController.sharedInstance().librariesController().libraries().filteredArrayUsingPredicate(predicate).firstObject();
	}

	// Return the frame library
	return frameLibrary;
}

function getFrameSettings(context) {
	// Get the frame symbols & names
	var libraryData = getLibraryData(context,frameLibrary),
		frameUsedLast = context.command.valueForKey_onLayer("frameUsedLast",context.document.documentData()),
		frameSymbol = (frameUsedLast) ? getObjectByID(libraryData.librarySymbols,frameUsedLast) : null,
		typeNames = libraryData.libraryPages.valueForKey("name"),
		typeNameSelect = (frameUsedLast) ? typeNames.indexOfObject(String(frameSymbol.parentPage().name())) : 0,
		predicate = NSPredicate.predicateWithFormat("parentPage.name == %@",typeNames[typeNameSelect]),
		frameSymbols = libraryData.librarySymbols.filteredArrayUsingPredicate(predicate),
		frameSymbolNames = (frameSymbols) ? frameSymbols.valueForKey("name") : ["No frames of this type"],
		frameSymbolSelect = (frameUsedLast) ? frameSymbols.indexOfObject(frameSymbol) : 0;

	// Default settings
	var defaultSettings = {};
	defaultSettings.artboardShadowState = 1;
	defaultSettings.frameSliceState = 0;

	// Update default settings with cached settings
	defaultSettings = getSettings(context,context.document.documentData(),defaultSettings,pluginIdentifier);

	// Create the alert window
	var alertWindow = createAlertWindow(context,pluginName,pluginDescription);

	// Create the type select, and add to alert window
	var typeSelect = createSelect(typeNames,typeNameSelect,NSMakeRect(0,0,300,28));
	alertWindow.addAccessoryView(typeSelect);

	// Create the type select delegate
	var typeSelectDelegate = new MochaJSDelegate({
		"comboBoxSelectionDidChange:" : (function(sender) {
			// Get the frame symbols & names
			var selectedType = sender.object().objectValueOfSelectedItem();
			predicate = NSPredicate.predicateWithFormat("parentPage.name == %@",selectedType);
			frameSymbols = libraryData.librarySymbols.filteredArrayUsingPredicate(predicate);
			frameSymbolNames = frameSymbols.valueForKey("name");

			// Empty and populate the type select
			frameSelect.removeAllItems();
			frameSelect.addItemsWithObjectValues(frameSymbolNames);
			frameSelect.selectItemAtIndex(0);

			// If there are frame symbols...
			if (frameSymbols) {
				// Disable form elements
				frameSelect.setEnabled(1);
				buttonOK.setEnabled(1);
			}
			// If there are no frame symbols...
			else {
				// Enable form elements
				frameSelect.setEnabled(0);
				buttonOK.setEnabled(0);
			}
		})
	});

	// Append the delegate to the type select
	typeSelect.setDelegate(typeSelectDelegate.getClassInstance());

	// Create the frame select, and add to alert window
	var frameSelect = createSelect(frameSymbolNames,frameSymbolSelect,NSMakeRect(0,0,300,28));
	alertWindow.addAccessoryView(frameSelect);

	// Create the artboard shadow checkbox, and add to alert window
	var shadowToggle = createCheckbox({name:"Disable artboard shadows",value:1},defaultSettings.artboardShadowState,NSMakeRect(0,0,300,18));
	alertWindow.addAccessoryView(shadowToggle);

	// Create the slice checkbox, and add to alert window
	var frameSlice = createCheckbox({name:"Create slice around frames",value:1},defaultSettings.frameSliceState,NSMakeRect(0,0,300,18));
	alertWindow.addAccessoryView(frameSlice);

	// Buttons for alert window
	var buttonOK = alertWindow.addButtonWithTitle("OK");
	var buttonCancel = alertWindow.addButtonWithTitle("Cancel");

	// If there are no frame symbols...
	if (!frameSymbols) {
		// Disable form elements
		frameSelect.setEnabled(0);
		buttonOK.setEnabled(0);
	}

	// Set key order
	setKeyOrder(alertWindow,[
		typeSelect,
		frameSelect,
		shadowToggle,
		frameSlice,
		buttonOK
	]);

	// Display the alert window and capture the response
	var alertResponse = alertWindow.runModal();

	// If user tapped OK button...
	if (alertResponse == 1000) {
		// Get current artboard shadow setting
		var showArtboardShadow = NSUserDefaults.standardUserDefaults().boolForKey("showArtboardShadow");

		// If the current setting and shadowToggle checkbox state conflict...
		if (shadowToggle.state() == 1 && showArtboardShadow == 1 || shadowToggle.state() == 0 && showArtboardShadow == 0) {
			// Toggle the artboard shadows
			actionWithType(context,"MSToggleArtboardShadowAction").toggleArtboardShadow(null);
		}

		// Remember the selections for future use
		context.command.setValue_forKey_onLayer(frameSymbols[frameSelect.indexOfSelectedItem()].objectID(),"frameUsedLast",context.document.documentData());
		context.command.setValue_forKey_onLayer(shadowToggle.state(),"artboardShadowState",context.document.documentData());
		context.command.setValue_forKey_onLayer(frameSlice.state(),"frameSliceState",context.document.documentData());

		// Return the selected frame
		return {
			frame : frameSymbols[frameSelect.indexOfSelectedItem()],
			slice : frameSlice.state()
		};
	} else return false;
}

function getLibraryData(context,library) {
	var libraryPath = library.locationOnDisk().path(),
		libraryFile = openFile(libraryPath),
		libraryPages = libraryFile.documentData().pages(),
		librarySymbols = libraryFile.documentData().allSymbols(),
		librarySymbolSort = NSSortDescriptor.sortDescriptorWithKey_ascending("name",1);

	libraryFile.close();

	libraryPages.removeObjectAtIndex(0);

	return {
		libraryPages : libraryPages,
		librarySymbols : librarySymbols.sortedArrayUsingDescriptors([librarySymbolSort])
	}
}

function getObjectByID(source,objectID) {
	var predicate = NSPredicate.predicateWithFormat("objectID == %@",objectID);

	return source.filteredArrayUsingPredicate(predicate).firstObject();
}

function getSettings(context,location,settings) {
	try {
		for (i in settings) {
			var value = context.command.valueForKey_onLayer(i,location);
			if (value) settings[i] = value;
		}

		return settings;
	} catch(err) {
		log("Unable to fetch settings");
	}
}

function googleAnalytics(context,category,action,label,value) {
	var trackingID = "UA-117546302-1",
		uuidKey = "google.analytics.uuid",
		uuid = NSUserDefaults.standardUserDefaults().objectForKey(uuidKey);

	if (!uuid) {
		uuid = NSUUID.UUID().UUIDString();
		NSUserDefaults.standardUserDefaults().setObject_forKey(uuid,uuidKey);
	}

	var url = "https://www.google-analytics.com/collect?v=1";
	// Tracking ID
	url += "&tid=" + trackingID;
	// Source
	url += "&ds=sketch" + MSApplicationMetadata.metadata().appVersion;
	// Client ID
	url += "&cid=" + uuid;
	// pageview, screenview, event, transaction, item, social, exception, timing
	url += "&t=event";
	// App Name
	url += "&an=" + encodeURI(context.plugin.name());
	// App ID
	url += "&aid=" + context.plugin.identifier();
	// App Version
	url += "&av=" + context.plugin.version();
	// Event category
	url += "&ec=" + encodeURI(category);
	// Event action
	url += "&ea=" + encodeURI(action);
	// Event label
	if (label) {
		url += "&el=" + encodeURI(label);
	}
	// Event value
	if (value) {
		url += "&ev=" + encodeURI(value);
	}

	var session = NSURLSession.sharedSession(),
		task = session.dataTaskWithURL(NSURL.URLWithString(NSString.stringWithString(url)));

	task.resume();
}

function importForeignSymbol(symbol,library) {
	var intoDocument = MSDocument.currentDocument().documentData(),
		libraryController = AppController.sharedInstance().librariesController(),
		foreignSymbol;

	if (MSApplicationMetadata.metadata().appVersion >= 50) {
		var objectReference = MSShareableObjectReference.referenceForShareableObject_inLibrary(symbol,library);

		foreignSymbol = libraryController.importShareableObjectReference_intoDocument(objectReference,intoDocument);
	} else {
		foreignSymbol = libraryController.importForeignSymbol_fromLibrary_intoDocument_(symbol,library,intoDocument);
	}

	return foreignSymbol;
}

function openFile(path) {
	var file = MSDocument.new();

	return (file.readFromURL_ofType_error(path,'com.bohemiancoding.sketch.drawing',nil)) ? file : nil;
}

function openUrl(url) {
	NSWorkspace.sharedWorkspace().openURL(NSURL.URLWithString(url));
}

function removeOrphans(context) {
	var frames = frameGroup.layers(),
		framesRemoved = 0;

	if (frames) {
		for (var i = 0; i < frames.length; i++) {
			var linkedToArtboard = context.command.valueForKey_onLayer("linkedToArtboard",frames[i]),
				linkedArtboard = context.document.documentData().artboardWithID(linkedToArtboard);

			if (!linkedArtboard) {
				frames[i].removeFromParent();

				framesRemoved++;
			}
		}
	}

	return framesRemoved;
}

function setKeyOrder(alert,order) {
	for (var i = 0; i < order.length; i++) {
		var thisItem = order[i],
			nextItem = order[i+1];

		if (nextItem) thisItem.setNextKeyView(nextItem);
	}

	alert.alert().window().setInitialFirstResponder(order[0]);
}

function updateFrames(context) {
	var frames = frameGroup.layers(),
		frameLoop = frames.objectEnumerator(),
		frame;

	while (frame = frameLoop.nextObject()) {
		var frameSymbol = frame.symbolMaster(),
			linkedToArtboard = context.command.valueForKey_onLayer("linkedToArtboard",frame),
			linkedArtboard = context.document.documentData().artboardWithID(linkedToArtboard);

		frame.absoluteRect().setX(linkedArtboard.frame().x() + context.command.valueForKey_onLayer("offsetX",frameSymbol));
		frame.absoluteRect().setY(linkedArtboard.frame().y() + context.command.valueForKey_onLayer("offsetY",frameSymbol));

		if (context.command.valueForKey_onLayer("canResize",frameSymbol)) {
			frame.frame().setWidth(linkedArtboard.frame().width() - context.command.valueForKey_onLayer("offsetX",frameSymbol))
			frame.frame().setHeight(linkedArtboard.frame().height() - context.command.valueForKey_onLayer("offsetY",frameSymbol))
		}
	}

	if (sketch.version.sketch > 52) {
		frameGroup.fixGeometryWithOptions(0);
	} else {
		frameGroup.resizeToFitChildrenWithOption(0);
	}
}
