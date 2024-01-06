port module BrowserApplication exposing (..)

import Browser
import Browser.Navigation
import Html exposing (Html)
import Html.Attributes
import Html.Events exposing (onClick)
import One.Strings
import Url exposing (Url)


main =
    Browser.application
        { init = init
        , update = update
        , subscriptions = subscriptions
        , onUrlChange = UrlChanged
        , onUrlRequest = LinkClicked
        , view = view
        }



-- MODEL


type alias Model =
    { number : Int, key : Browser.Navigation.Key }



-- INIT


init : Flags -> Url -> Browser.Navigation.Key -> ( Model, Cmd Msg )
init flags url key =
    ( { number = 1, key = key }, outgoing () )


type alias Flags =
    -- Int
    ()



-- UPDATE


type Msg
    = NoOp
    | Increment
    | IncrementViaPort
    | LinkClicked Browser.UrlRequest
    | UrlChanged Url


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        NoOp ->
            ( model, Cmd.none )

        Increment ->
            ( { model | number = model.number + 1 }, Cmd.none )

        IncrementViaPort ->
            ( model, outgoing () )

        LinkClicked (Browser.Internal url) ->
            ( model, Browser.Navigation.pushUrl model.key (Url.toString url) )

        LinkClicked (Browser.External href) ->
            ( model, Browser.Navigation.load href )

        UrlChanged url ->
            ( { model
                | number =
                    url.fragment |> Maybe.andThen String.toInt |> Maybe.withDefault 0
              }
            , Cmd.none
            )



-- SUBSCRIPTION


subscriptions : Model -> Sub Msg
subscriptions model =
    incoming (always Increment)



-- PORTS


port outgoing : () -> Cmd msg


port incoming : (Int -> msg) -> Sub msg



-- VIEW


view : Model -> Browser.Document Msg
view { number } =
    { title = "HMR with BrowserApplication"
    , body = [ body number ]
    }


body : Int -> Html Msg
body number =
    Html.div [ Html.Attributes.id "BrowserApplication" ]
        [ Html.h1 [] [ Html.text "BrowserApplication" ]
        , Html.ol []
            [ Html.li [ Html.Attributes.id "self" ]
                [ Html.text self ]
            , Html.li [ Html.Attributes.id "string1" ]
                [ Html.text One.Strings.string1 ]
            , Html.li [ Html.Attributes.id "string12" ]
                [ Html.text One.Strings.string12 ]
            , Html.li []
                [ Html.text "number:"
                , Html.span [ Html.Attributes.id "number" ] [ Html.text <| String.fromInt number ]
                ]
            , Html.li [] [ Html.button [ onClick Increment ] [ Html.text "+" ] ]
            , Html.li [] [ Html.button [ onClick IncrementViaPort ] [ Html.text "+ (Port)" ] ]
            , Html.li [] [ changeUrl <| String.fromInt (number + 1) ]
            ]
        ]


changeUrl new =
    Html.a [ Html.Attributes.href <| "#" ++ new ]
        [ Html.text <| "=" ++ new ++ " (URL)" ]


self =
    "#self:0"
