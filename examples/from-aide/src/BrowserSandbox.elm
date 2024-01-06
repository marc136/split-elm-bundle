module BrowserSandbox exposing (..)

import Browser
import Html exposing (Html)
import Html.Attributes
import Html.Events exposing (onClick)
import One.Strings


main =
    Browser.sandbox { init = init, update = update, view = view }



-- MODEL


type alias Model =
    Int


init : Model
init =
    0



-- UPDATE


type Msg
    = Increment


update : Msg -> Model -> Model
update msg model =
    case msg of
        Increment ->
            model + 1



-- VIEW


view : Model -> Html Msg
view number =
    Html.div [ Html.Attributes.id "BrowserSandbox" ]
        [ Html.h1 [] [ Html.text "BrowserSandbox" ]
        , Html.ol []
            [ Html.li [ Html.Attributes.id "self" ]
                [ Html.text self ]
            , Html.li [ Html.Attributes.id "string1" ]
                [ Html.text One.Strings.string1 ]
            , Html.li [ Html.Attributes.id "string12" ]
                [ Html.text One.Strings.string12 ]
            , Html.li []
                [ Html.button [ onClick Increment ] [ Html.text "+" ]
                , Html.span [ Html.Attributes.id "number" ] [ Html.text <| String.fromInt number ]
                ]
            ]
        ]


self =
    "#self:0"
