#!/bin/env bash

# compile the js bundle
elm make --optimize --output=www/examples.js src/Animation.elm src/Clock.elm src/TextField.elm src/Quotes.elm

# split the bundle
node ../../bin/split-elm-bundle.mjs www/examples.js
